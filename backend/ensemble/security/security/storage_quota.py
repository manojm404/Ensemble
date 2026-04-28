"""
core/security/storage_quota.py
Per-user and per-agent storage quota enforcement for the Ensemble platform.

Implements:
- Per-user storage quotas by tier (free: 5 GB, pro: 50 GB, enterprise: 500 GB)
- Per-agent venv size limits (500 MB max on free tier, 2 GB pro, 10 GB enterprise)
- Blocking of expensive packages (tensorflow, pytorch, cuda variants)
- Warning generation when approaching limits (>80% usage)

All sizes are tracked in bytes. The quota manager can be integrated with
the EnsembleSpace CAS backend or any filesystem-based storage.

Usage:
    from core.security.storage_quota import QuotaManager, UserTier

    mgr = QuotaManager()
    mgr.register_user("user_1", tier=UserTier.FREE)

    # Record storage usage
    mgr.add_usage("user_1", storage_bytes=2_000_000_000)

    # Check if a new write is allowed
    allowed = mgr.check_write_quota("user_1", additional_bytes=1_000_000_000)
    print(allowed)  # True (still within quota)

    # Check if a pip install is allowed
    pkg_check = mgr.check_package_install("user_1", "tensorflow")
    print(pkg_check.allowed)  # False

    # Get warning status
    warnings = mgr.get_quota_warnings("user_1")
    print(warnings)  # May warn if approaching limits
"""

import logging
import os
import shutil
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GB = 1024 ** 3
MB = 1024 ** 2

# Storage quotas by tier (in bytes)
USER_STORAGE_QUOTAS = {
    "free": 5 * GB,
    "pro": 50 * GB,
    "enterprise": 500 * GB,
}

# Agent venv size limits by tier (in bytes)
AGENT_VENV_LIMITS = {
    "free": 500 * MB,
    "pro": 2 * GB,
    "enterprise": 10 * GB,
}

# Packages that are expensive to install (disk + compute cost)
BLOCKED_PACKAGES = frozenset({
    "tensorflow",
    "tensorflow-gpu",
    "tensorflow-cpu",
    "torch",
    "pytorch",
    "torchvision",
    "torchaudio",
    "cuda-python",
    "cupy",
    "cupy-cuda11x",
    "cupy-cuda12x",
    "nvidia-cublas-cu11",
    "nvidia-cuda-runtime-cu11",
    "nvidia-cudnn-cu11",
    "jax[cuda]",
    "tensorflow-probability",
})

# Warning threshold (percentage of quota)
WARNING_THRESHOLD = 0.80


# ---------------------------------------------------------------------------
# Enums and data models
# ---------------------------------------------------------------------------

class UserTier(Enum):
    """Subscription tier determining storage quota."""

    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


@dataclass
class UsageRecord:
    """Tracks storage usage for a single user or agent."""

    user_id: str
    tier: UserTier
    storage_bytes: int = 0
    venv_bytes: int = 0
    registered_at: str = ""
    last_updated: str = ""

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "tier": self.tier.value,
            "storage_bytes": self.storage_bytes,
            "storage_gb": round(self.storage_bytes / GB, 3),
            "venv_bytes": self.venv_bytes,
            "venv_mb": round(self.venv_bytes / MB, 2),
            "registered_at": self.registered_at,
            "last_updated": self.last_updated,
        }


@dataclass
class QuotaCheckResult:
    """Result of a quota check operation."""

    allowed: bool
    user_id: str
    tier: str
    current_usage: int
    quota_limit: int
    requested: int
    usage_percentage: float
    message: str

    @property
    def is_warning(self) -> bool:
        """Return True if usage exceeds the warning threshold."""
        return self.usage_percentage >= WARNING_THRESHOLD

    def to_dict(self) -> dict:
        return {
            "allowed": self.allowed,
            "user_id": self.user_id,
            "tier": self.tier,
            "current_usage_bytes": self.current_usage,
            "current_usage_gb": round(self.current_usage / GB, 3),
            "quota_limit_bytes": self.quota_limit,
            "quota_limit_gb": round(self.quota_limit / GB, 3),
            "requested_bytes": self.requested,
            "usage_percentage": round(self.usage_percentage, 2),
            "is_warning": self.is_warning,
            "message": self.message,
        }


@dataclass
class PackageCheckResult:
    """Result of checking whether a package can be installed."""

    allowed: bool
    package: str
    reason: str
    blocked_by_quota: bool = False
    blocked_by_policy: bool = False

    def to_dict(self) -> dict:
        return {
            "allowed": self.allowed,
            "package": self.package,
            "reason": self.reason,
            "blocked_by_quota": self.blocked_by_quota,
            "blocked_by_policy": self.blocked_by_policy,
        }


@dataclass
class QuotaWarning:
    """A warning about approaching or exceeding a quota limit."""

    user_id: str
    warning_type: str  # "storage_warning", "storage_exceeded", "venv_warning", "venv_exceeded"
    current_usage: int
    quota_limit: int
    usage_percentage: float
    message: str
    timestamp: str = ""

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "warning_type": self.warning_type,
            "current_usage_bytes": self.current_usage,
            "current_usage_gb": round(self.current_usage / GB, 3),
            "quota_limit_bytes": self.quota_limit,
            "quota_limit_gb": round(self.quota_limit / GB, 3),
            "usage_percentage": round(self.usage_percentage, 2),
            "message": self.message,
            "timestamp": self.timestamp,
        }


# ---------------------------------------------------------------------------
# QuotaManager
# ---------------------------------------------------------------------------

class QuotaManager:
    """Manage and enforce storage quotas for users and agent environments.

    Thread safety:
        All public methods are protected by an internal lock.
    """

    def __init__(
        self,
        storage_quotas: Optional[Dict[str, int]] = None,
        venv_limits: Optional[Dict[str, int]] = None,
        blocked_packages: Optional[frozenset] = None,
    ):
        self._storage_quotas = storage_quotas or USER_STORAGE_QUOTAS
        self._venv_limits = venv_limits or AGENT_VENV_LIMITS
        self._blocked_packages = blocked_packages or BLOCKED_PACKAGES

        self._users: Dict[str, UsageRecord] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # User registration / deregistration
    # ------------------------------------------------------------------

    def register_user(
        self,
        user_id: str,
        tier: UserTier = UserTier.FREE,
        initial_storage: int = 0,
        initial_venv: int = 0,
    ) -> UsageRecord:
        """Register a user with the specified tier.

        Parameters
        ----------
        user_id : str
            Unique user identifier.
        tier : UserTier
            Subscription tier.
        initial_storage : int
            Initial storage usage in bytes (for migration scenarios).
        initial_venv : int
            Initial venv usage in bytes.

        Returns
        -------
        UsageRecord
            The created usage record.
        """
        now = datetime.now(timezone.utc).isoformat()
        record = UsageRecord(
            user_id=user_id,
            tier=tier,
            storage_bytes=initial_storage,
            venv_bytes=initial_venv,
            registered_at=now,
            last_updated=now,
        )

        with self._lock:
            self._users[user_id] = record

        logger.info(
            "Registered user %s with tier %s (storage=%d bytes, venv=%d bytes)",
            user_id,
            tier.value,
            initial_storage,
            initial_venv,
        )
        return record

    def deregister_user(self, user_id: str) -> bool:
        """Remove a user from quota tracking."""
        with self._lock:
            removed = self._users.pop(user_id, None) is not None
        if removed:
            logger.info("Deregistered user %s", user_id)
        return removed

    def update_tier(self, user_id: str, new_tier: UserTier) -> bool:
        """Change a user's subscription tier.

        Returns True if the user was found and updated.
        """
        with self._lock:
            record = self._users.get(user_id)
            if record is None:
                return False
            record.tier = new_tier
            record.last_updated = datetime.now(timezone.utc).isoformat()
        logger.info("Updated user %s tier to %s", user_id, new_tier.value)
        return True

    def get_usage(self, user_id: str) -> Optional[UsageRecord]:
        """Get the current usage record for a user."""
        with self._lock:
            record = self._users.get(user_id)
            if record is None:
                return None
            # Return a copy to avoid mutation
            return UsageRecord(
                user_id=record.user_id,
                tier=record.tier,
                storage_bytes=record.storage_bytes,
                venv_bytes=record.venv_bytes,
                registered_at=record.registered_at,
                last_updated=record.last_updated,
            )

    # ------------------------------------------------------------------
    # Usage tracking
    # ------------------------------------------------------------------

    def add_usage(
        self,
        user_id: str,
        storage_bytes: int = 0,
        venv_bytes: int = 0,
    ) -> Optional[UsageRecord]:
        """Add to a user's tracked usage.

        Parameters
        ----------
        user_id : str
            The user to update.
        storage_bytes : int
            Additional storage bytes to add (can be negative for deletions).
        venv_bytes : int
            Additional venv bytes to add (can be negative for deletions).

        Returns
        -------
        UsageRecord or None
            Updated record, or None if user not found.
        """
        with self._lock:
            record = self._users.get(user_id)
            if record is None:
                return None
            record.storage_bytes = max(0, record.storage_bytes + storage_bytes)
            record.venv_bytes = max(0, record.venv_bytes + venv_bytes)
            record.last_updated = datetime.now(timezone.utc).isoformat()
            return UsageRecord(
                user_id=record.user_id,
                tier=record.tier,
                storage_bytes=record.storage_bytes,
                venv_bytes=record.venv_bytes,
                registered_at=record.registered_at,
                last_updated=record.last_updated,
            )

    def set_usage(
        self,
        user_id: str,
        storage_bytes: int,
        venv_bytes: int,
    ) -> Optional[UsageRecord]:
        """Set absolute usage values (overwrite)."""
        with self._lock:
            record = self._users.get(user_id)
            if record is None:
                return None
            record.storage_bytes = max(0, storage_bytes)
            record.venv_bytes = max(0, venv_bytes)
            record.last_updated = datetime.now(timezone.utc).isoformat()
            return UsageRecord(
                user_id=record.user_id,
                tier=record.tier,
                storage_bytes=record.storage_bytes,
                venv_bytes=record.venv_bytes,
                registered_at=record.registered_at,
                last_updated=record.last_updated,
            )

    # ------------------------------------------------------------------
    # Quota checks
    # ------------------------------------------------------------------

    def check_write_quota(
        self, user_id: str, additional_bytes: int
    ) -> QuotaCheckResult:
        """Check if a user can write an additional amount of data.

        Parameters
        ----------
        user_id : str
            The user requesting the write.
        additional_bytes : int
            Size of the data to write in bytes.

        Returns
        -------
        QuotaCheckResult
            Whether the write is allowed and relevant details.
        """
        with self._lock:
            record = self._users.get(user_id)

        if record is None:
            return QuotaCheckResult(
                allowed=False,
                user_id=user_id,
                tier="unknown",
                current_usage=0,
                quota_limit=0,
                requested=additional_bytes,
                usage_percentage=0.0,
                message=f"User {user_id} not registered in quota system",
            )

        quota = self._storage_quotas.get(record.tier.value, 0)
        new_usage = record.storage_bytes + additional_bytes
        pct = (new_usage / quota * 100) if quota > 0 else 100.0
        allowed = new_usage <= quota

        if allowed:
            message = (
                f"Write allowed: {additional_bytes} bytes for user {user_id} "
                f"({record.tier.value} tier, {pct:.1f}% of quota)"
            )
        else:
            message = (
                f"Write blocked: {additional_bytes} bytes would exceed quota "
                f"for user {user_id} ({record.tier.value} tier, "
                f"current={record.storage_bytes}, limit={quota}, "
                f"new_total={new_usage})"
            )

        result = QuotaCheckResult(
            allowed=allowed,
            user_id=user_id,
            tier=record.tier.value,
            current_usage=record.storage_bytes,
            quota_limit=quota,
            requested=additional_bytes,
            usage_percentage=pct,
            message=message,
        )

        if not allowed:
            logger.warning("Quota write blocked: %s", message)
        elif pct >= WARNING_THRESHOLD * 100:
            logger.warning("Quota warning: %s", message)

        return result

    def check_venv_quota(
        self, user_id: str, additional_venv_bytes: int
    ) -> QuotaCheckResult:
        """Check if a user's agent venv can grow by the specified amount."""
        with self._lock:
            record = self._users.get(user_id)

        if record is None:
            return QuotaCheckResult(
                allowed=False,
                user_id=user_id,
                tier="unknown",
                current_usage=0,
                quota_limit=0,
                requested=additional_venv_bytes,
                usage_percentage=0.0,
                message=f"User {user_id} not registered in quota system",
            )

        limit = self._venv_limits.get(record.tier.value, 0)
        new_venv = record.venv_bytes + additional_venv_bytes
        pct = (new_venv / limit * 100) if limit > 0 else 100.0
        allowed = new_venv <= limit

        if allowed:
            message = (
                f"Venv expansion allowed: {additional_venv_bytes} bytes "
                f"for user {user_id} ({record.tier.value} tier, {pct:.1f}% of limit)"
            )
        else:
            message = (
                f"Venv expansion blocked: {additional_venv_bytes} bytes would exceed "
                f"venv limit for user {user_id} ({record.tier.value} tier, "
                f"current={record.venv_bytes}, limit={limit}, "
                f"new_total={new_venv})"
            )

        result = QuotaCheckResult(
            allowed=allowed,
            user_id=user_id,
            tier=record.tier.value,
            current_usage=record.venv_bytes,
            quota_limit=limit,
            requested=additional_venv_bytes,
            usage_percentage=pct,
            message=message,
        )

        if not allowed:
            logger.warning("Venv quota blocked: %s", message)

        return result

    def check_package_install(
        self, user_id: str, package_name: str
    ) -> PackageCheckResult:
        """Check if a package can be installed for a user.

        Checks two conditions:
        1. Whether the package is in the blocked list (policy check).
        2. Whether the user has enough venv quota remaining.

        Parameters
        ----------
        user_id : str
            The user attempting the install.
        package_name : str
            The package name (e.g. "tensorflow", "requests").

        Returns
        -------
        PackageCheckResult
            Whether the install is allowed and why.
        """
        # Normalize package name for matching
        pkg_normalized = package_name.lower().split("[")[0].strip()

        # Policy check: blocked packages
        if pkg_normalized in self._blocked_packages:
            return PackageCheckResult(
                allowed=False,
                package=package_name,
                reason=(
                    f"Package '{package_name}' is blocked by policy. "
                    f"It is a high-cost package (ML/GPU frameworks are "
                    f"restricted to enterprise tier with approval)."
                ),
                blocked_by_policy=True,
            )

        # Quota check: estimate package size (rough heuristic)
        # Most packages are 1-50 MB; ML packages are 500 MB - 2 GB
        # We use a conservative 500 MB estimate for any package
        estimated_size = 500 * MB
        with self._lock:
            record = self._users.get(user_id)

        if record is None:
            return PackageCheckResult(
                allowed=False,
                package=package_name,
                reason=f"User {user_id} not registered in quota system",
                blocked_by_quota=True,
            )

        venv_limit = self._venv_limits.get(record.tier.value, 0)
        if record.venv_bytes + estimated_size > venv_limit:
            return PackageCheckResult(
                allowed=False,
                package=package_name,
                reason=(
                    f"Package '{package_name}' (~{estimated_size // MB} MB) would exceed "
                    f"venv quota for user {user_id} "
                    f"(tier={record.tier.value}, "
                    f"used={record.venv_bytes // MB} MB, "
                    f"limit={venv_limit // MB} MB)"
                ),
                blocked_by_quota=True,
            )

        return PackageCheckResult(
            allowed=True,
            package=package_name,
            reason=f"Package '{package_name}' is allowed for user {user_id}",
        )

    # ------------------------------------------------------------------
    # Warnings
    # ------------------------------------------------------------------

    def get_quota_warnings(self, user_id: str) -> List[QuotaWarning]:
        """Generate warnings for a user approaching or exceeding quotas.

        Returns a list of QuotaWarning objects for any thresholds that
        have been crossed (e.g., >80% storage usage).
        """
        warnings: List[QuotaWarning] = []
        now = datetime.now(timezone.utc).isoformat()

        with self._lock:
            record = self._users.get(user_id)

        if record is None:
            return warnings

        # Storage warnings
        storage_quota = self._storage_quotas.get(record.tier.value, 0)
        if storage_quota > 0:
            storage_pct = (record.storage_bytes / storage_quota) * 100
            if storage_pct >= 100:
                warnings.append(
                    QuotaWarning(
                        user_id=user_id,
                        warning_type="storage_exceeded",
                        current_usage=record.storage_bytes,
                        quota_limit=storage_quota,
                        usage_percentage=storage_pct,
                        message=(
                            f"CRITICAL: Storage quota EXCEEDED for user {user_id}. "
                            f"Usage: {record.storage_bytes / GB:.2f} GB / "
                            f"{storage_quota / GB:.0f} GB ({storage_pct:.1f}%)"
                        ),
                        timestamp=now,
                    )
                )
            elif storage_pct >= WARNING_THRESHOLD * 100:
                warnings.append(
                    QuotaWarning(
                        user_id=user_id,
                        warning_type="storage_warning",
                        current_usage=record.storage_bytes,
                        quota_limit=storage_quota,
                        usage_percentage=storage_pct,
                        message=(
                            f"WARNING: Storage quota approaching limit for user {user_id}. "
                            f"Usage: {record.storage_bytes / GB:.2f} GB / "
                            f"{storage_quota / GB:.0f} GB ({storage_pct:.1f}%)"
                        ),
                        timestamp=now,
                    )
                )

        # Venv warnings
        venv_limit = self._venv_limits.get(record.tier.value, 0)
        if venv_limit > 0:
            venv_pct = (record.venv_bytes / venv_limit) * 100
            if venv_pct >= 100:
                warnings.append(
                    QuotaWarning(
                        user_id=user_id,
                        warning_type="venv_exceeded",
                        current_usage=record.venv_bytes,
                        quota_limit=venv_limit,
                        usage_percentage=venv_pct,
                        message=(
                            f"CRITICAL: Venv quota EXCEEDED for user {user_id}. "
                            f"Usage: {record.venv_bytes / MB:.0f} MB / "
                            f"{venv_limit / MB:.0f} MB ({venv_pct:.1f}%)"
                        ),
                        timestamp=now,
                    )
                )
            elif venv_pct >= WARNING_THRESHOLD * 100:
                warnings.append(
                    QuotaWarning(
                        user_id=user_id,
                        warning_type="venv_warning",
                        current_usage=record.venv_bytes,
                        quota_limit=venv_limit,
                        usage_percentage=venv_pct,
                        message=(
                            f"WARNING: Venv quota approaching limit for user {user_id}. "
                            f"Usage: {record.venv_bytes / MB:.0f} MB / "
                            f"{venv_limit / MB:.0f} MB ({venv_pct:.1f}%)"
                        ),
                        timestamp=now,
                    )
                )

        return warnings

    # ------------------------------------------------------------------
    # Filesystem helpers
    # ------------------------------------------------------------------

    @staticmethod
    def get_directory_size(path: str) -> int:
        """Calculate the total size of a directory in bytes.

        Parameters
        ----------
        path : str
            Path to the directory.

        Returns
        -------
        int
            Total size in bytes.
        """
        total = 0
        dirpath = Path(path)
        if not dirpath.exists():
            return 0
        if dirpath.is_file():
            return dirpath.stat().st_size
        for entry in dirpath.rglob("*"):
            try:
                if entry.is_file():
                    total += entry.stat().st_size
            except (OSError, PermissionError):
                logger.warning("Cannot read size of %s", entry)
        return total

    @staticmethod
    def get_venv_size(venv_path: str) -> int:
        """Calculate the size of a Python virtual environment.

        Parameters
        ----------
        venv_path : str
            Path to the venv root (containing bin/, lib/, etc.).

        Returns
        -------
        int
            Total venv size in bytes.
        """
        return QuotaManager.get_directory_size(venv_path)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def list_all_users(self) -> List[Dict]:
        """Return usage records for all registered users."""
        with self._lock:
            return [record.to_dict() for record in self._users.values()]
