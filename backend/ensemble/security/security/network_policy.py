"""
core/security/network_policy.py
iptables-based network whitelist enforcement for Ensemble agent sandboxes.

Generates iptables rules that implement a default-DROP outbound policy,
allowing only explicitly whitelisted domains. Designed to be consumed by
container startup scripts or applied directly on the host.

Usage:
    from backend.ensemble.security.network_policy import NetworkPolicy

    policy = NetworkPolicy()
    policy.add_domain("api.openai.com")
    policy.add_domain("pypi.org")
    rules = policy.generate_iptables_rules()

    # Each rule is a string that can be passed to iptables-restore or
    # written to a container startup script.
    for rule in rules:
        print(rule)

The policy resolves domain names to IPs at rule-generation time so that
the resulting iptables rules work even without DNS resolution inside the
sandbox.
"""

import ipaddress
import logging
import socket
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_DNS_SERVERS: List[str] = ["8.8.8.8", "8.8.4.4"]
ALLOWED_LOOPBACK = True
ALLOWED_ESTABLISHED = True
LOG_PREFIX = "ENSEMBLE_BLOCKED: "

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class DomainEntry:
    """Metadata for a single whitelisted domain."""

    domain: str
    added_at: str
    resolved_ips: List[str] = field(default_factory=list)
    ports: List[int] = field(default_factory=lambda: [443, 80])

    def to_dict(self) -> dict:
        return {
            "domain": self.domain,
            "added_at": self.added_at,
            "resolved_ips": self.resolved_ips,
            "ports": self.ports,
        }


@dataclass
class NetworkPolicySummary:
    """Snapshot of the current policy state."""

    total_domains: int
    total_ips: int
    domains: List[Dict]
    generated_at: str

    def to_dict(self) -> dict:
        return {
            "total_domains": self.total_domains,
            "total_ips": self.total_ips,
            "domains": self.domains,
            "generated_at": self.generated_at,
        }


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------


class DomainResolver:
    """Thread-safe DNS resolver with caching.

    Resolves domain names to IP addresses with a configurable TTL.
    Used by NetworkPolicy to convert domain whitelists into concrete
    iptables IP rules.
    """

    def __init__(self, ttl_seconds: int = 300):
        self._ttl = ttl_seconds
        self._cache: Dict[str, Tuple[List[str], float]] = {}
        self._lock = threading.Lock()

    def resolve(self, domain: str) -> List[str]:
        """Resolve *domain* to a list of IPv4 addresses.

        Returns cached results if they are still valid (within TTL).
        On cache miss or expiry, performs a fresh DNS lookup.
        """
        now = time.monotonic()

        with self._lock:
            if domain in self._cache:
                ips, timestamp = self._cache[domain]
                if now - timestamp < self._ttl:
                    return ips

        # Perform DNS lookup (outside lock to avoid blocking other threads)
        try:
            results = socket.getaddrinfo(domain, None, socket.AF_INET)
            ips = list({result[4][0] for result in results})
        except socket.gaierror as exc:
            logger.warning("DNS resolution failed for %s: %s", domain, exc)
            ips = []

        with self._lock:
            self._cache[domain] = (ips, now)

        return ips

    def clear_cache(self) -> None:
        """Clear the entire DNS cache."""
        with self._lock:
            self._cache.clear()

    def invalidate(self, domain: str) -> None:
        """Remove a single domain from the cache."""
        with self._lock:
            self._cache.pop(domain, None)


# ---------------------------------------------------------------------------
# NetworkPolicy
# ---------------------------------------------------------------------------


class NetworkPolicy:
    """Manage a whitelist of allowed outbound domains and generate iptables rules.

    The policy follows a default-DROP model: all outbound traffic is blocked
    unless the destination IP matches a resolved whitelist entry.

    Thread safety:
        All public methods are protected by an internal lock.
    """

    def __init__(
        self,
        resolver: Optional[DomainResolver] = None,
        dns_servers: Optional[List[str]] = None,
        log_blocked: bool = True,
        allow_loopback: bool = True,
        allow_established: bool = True,
    ):
        self._domains: Dict[str, DomainEntry] = {}
        self._lock = threading.Lock()
        self._resolver = resolver or DomainResolver()
        self._dns_servers = dns_servers or DEFAULT_DNS_SERVERS
        self._log_blocked = log_blocked
        self._allow_loopback = allow_loopback
        self._allow_established = allow_established

    # ------------------------------------------------------------------
    # Public API: add / remove / list
    # ------------------------------------------------------------------

    def add_domain(
        self,
        domain: str,
        ports: Optional[List[int]] = None,
    ) -> DomainEntry:
        """Add *domain* to the whitelist.

        The domain is resolved to IP addresses immediately (or from cache).
        If the domain is already present, its ports list is updated.

        Parameters
        ----------
        domain : str
            Domain name to whitelist (e.g. "api.openai.com").
        ports : list[int], optional
            Allowed destination ports. Defaults to [443, 80].

        Returns
        -------
        DomainEntry
            The created or updated domain entry.
        """
        if ports is None:
            ports = [443, 80]

        resolved = self._resolver.resolve(domain)
        if not resolved:
            logger.warning(
                "Domain %s could not be resolved; adding with empty IP list", domain
            )

        now = datetime.now(timezone.utc).isoformat()
        entry = DomainEntry(
            domain=domain,
            added_at=now,
            resolved_ips=resolved,
            ports=ports,
        )

        with self._lock:
            self._domains[domain] = entry

        logger.info("Whitelisted domain %s -> %s", domain, resolved)
        return entry

    def remove_domain(self, domain: str) -> bool:
        """Remove *domain* from the whitelist.

        Returns True if the domain was present, False otherwise.
        """
        with self._lock:
            removed = self._domains.pop(domain, None) is not None

        if removed:
            self._resolver.invalidate(domain)
            logger.info("Removed domain %s from whitelist", domain)

        return removed

    def list_domains(self) -> List[DomainEntry]:
        """Return a copy of all whitelisted domain entries."""
        with self._lock:
            return list(self._domains.values())

    def get_entry(self, domain: str) -> Optional[DomainEntry]:
        """Return the entry for a specific domain, or None."""
        with self._lock:
            return self._domains.get(domain)

    # ------------------------------------------------------------------
    # iptables rule generation
    # ------------------------------------------------------------------

    def generate_iptables_rules(self, chain_name: str = "ENSEMBLE_OUTPUT") -> List[str]:
        """Generate a complete set of iptables rules implementing the policy.

        The output is a list of iptables command strings that should be
        executed in order. The rules implement:

        1. Create a custom chain.
        2. Allow loopback traffic (optional).
        3. Allow established/related connections (optional).
        4. Allow DNS resolution to configured DNS servers (UDP 53).
        5. For each whitelisted domain, allow outbound TCP to resolved IPs.
        6. Log blocked traffic (optional).
        7. Default DROP for everything else.

        Parameters
        ----------
        chain_name : str
            Name of the custom iptables chain.

        Returns
        -------
        list[str]
            Ordered list of iptables commands.
        """
        rules: List[str] = []

        # 1. Create custom chain (flush first to avoid duplicates on re-run)
        rules.append(f"iptables -F {chain_name} 2>/dev/null || true")
        rules.append(f"iptables -N {chain_name}")

        # 2. Jump to custom chain from OUTPUT
        rules.append(f"iptables -A OUTPUT -j {chain_name}")

        # 3. Allow loopback
        if self._allow_loopback:
            rules.append(f"iptables -A {chain_name} -i lo -j ACCEPT")

        # 4. Allow established/related connections
        if self._allow_established:
            rules.append(
                f"iptables -A {chain_name} -m conntrack "
                f"--ctstate ESTABLISHED,RELATED -j ACCEPT"
            )

        # 5. Allow DNS resolution (so the container can resolve domains at runtime)
        for dns_ip in self._dns_servers:
            rules.append(
                f"iptables -A {chain_name} -p udp " f"--dport 53 -d {dns_ip} -j ACCEPT"
            )
            rules.append(
                f"iptables -A {chain_name} -p tcp " f"--dport 53 -d {dns_ip} -j ACCEPT"
            )

        # 6. Allow whitelisted domains
        with self._lock:
            entries = list(self._domains.values())

        for entry in entries:
            for ip in entry.resolved_ips:
                # Validate IP
                try:
                    ipaddress.ip_address(ip)
                except ValueError:
                    logger.warning(
                        "Skipping invalid IP %s for domain %s", ip, entry.domain
                    )
                    continue

                for port in entry.ports:
                    rules.append(
                        f"iptables -A {chain_name} -p tcp "
                        f"--dport {port} -d {ip} -j ACCEPT "
                        f"# {entry.domain}"
                    )

        # 7. Log blocked traffic
        if self._log_blocked:
            rules.append(
                f"iptables -A {chain_name} -j LOG "
                f'--log-prefix "{LOG_PREFIX}" --log-level 4'
            )

        # 8. Default DROP
        rules.append(f"iptables -A {chain_name} -j DROP")

        logger.info(
            "Generated %d iptables rules for chain %s (%d domains)",
            len(rules),
            chain_name,
            len(entries),
        )
        return rules

    def generate_iptables_restore(self, chain_name: str = "ENSEMBLE_OUTPUT") -> str:
        """Generate rules in iptables-restore format (more efficient for bulk loading).

        Returns a single string that can be piped to iptables-restore.
        """
        lines = ["# Generated by Ensemble NetworkPolicy", f"*filter"]

        # Custom chain declaration
        lines.append(f":{chain_name} - [0:0]")

        # Jump from OUTPUT
        lines.append(f"-A OUTPUT -j {chain_name}")

        if self._allow_loopback:
            lines.append(f"-A {chain_name} -i lo -j ACCEPT")

        if self._allow_established:
            lines.append(
                f"-A {chain_name} -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT"
            )

        for dns_ip in self._dns_servers:
            lines.append(f"-A {chain_name} -p udp --dport 53 -d {dns_ip} -j ACCEPT")
            lines.append(f"-A {chain_name} -p tcp --dport 53 -d {dns_ip} -j ACCEPT")

        with self._lock:
            entries = list(self._domains.values())

        for entry in entries:
            for ip in entry.resolved_ips:
                try:
                    ipaddress.ip_address(ip)
                except ValueError:
                    continue
                for port in entry.ports:
                    comment = f"-A {chain_name} -p tcp --dport {port} -d {ip} -j ACCEPT"
                    lines.append(f"{comment} # {entry.domain}")

        if self._log_blocked:
            lines.append(
                f'-A {chain_name} -j LOG --log-prefix "{LOG_PREFIX}" --log-level 4'
            )

        lines.append(f"-A {chain_name} -j DROP")
        lines.append("COMMIT")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Policy management
    # ------------------------------------------------------------------

    def summary(self) -> NetworkPolicySummary:
        """Return a summary of the current policy."""
        with self._lock:
            entries = list(self._domains.values())

        total_ips = sum(len(e.resolved_ips) for e in entries)
        now = datetime.now(timezone.utc).isoformat()

        return NetworkPolicySummary(
            total_domains=len(entries),
            total_ips=total_ips,
            domains=[e.to_dict() for e in entries],
            generated_at=now,
        )

    def refresh_resolutions(self) -> None:
        """Re-resolve all whitelisted domains to update IPs.

        Useful for long-running containers where DNS records may have changed.
        """
        with self._lock:
            domains_to_refresh = list(self._domains.keys())

        for domain in domains_to_refresh:
            new_ips = self._resolver.resolve(domain)
            with self._lock:
                if domain in self._domains:
                    self._domains[domain].resolved_ips = new_ips

            logger.info("Refreshed DNS for %s -> %s", domain, new_ips)

    def clear(self) -> None:
        """Remove all domains from the whitelist."""
        with self._lock:
            self._domains.clear()
        self._resolver.clear_cache()
        logger.info("Cleared all whitelisted domains")
