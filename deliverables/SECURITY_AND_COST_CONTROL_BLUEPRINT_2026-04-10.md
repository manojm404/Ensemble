# Ensemble Security & Cost Control Blueprint

**Date**: April 10, 2026  
**Version**: 1.0  
**Status**: Approved for Implementation  
**Author**: Ensemble Engineering Team  

---

## 🎯 Executive Summary

This document outlines the comprehensive security hardening and cost control implementation for the Ensemble platform. Following honest security assessment revealing critical vulnerabilities (Docker escape possible, no dynamic import blocking, no network enforcement, no recursion guards, no storage limits), we are building a production-grade security foundation BEFORE adding the Universal Importer feature.

**Core Principle**: *"Security isn't a feature. It's the price of entry."*

---

## 🔴 CRITICAL VULNERABILITIES FOUND

| # | Vulnerability | Risk Level | Status |
|---|---------------|------------|--------|
| 1 | Docker socket accessible → container escape | 🔴 CRITICAL | Must fix |
| 2 | Dynamic imports bypass static analysis | 🔴 CRITICAL | Must fix |
| 3 | Network whitelist not enforced | 🔴 CRITICAL | Must fix |
| 4 | No recursion guards → infinite LLM calls | 🟡 HIGH | Must fix |
| 5 | No storage quotas → 25GB+ dependency bloat | 🟡 HIGH | Must fix |
| 6 | No LLM input truncation → token explosions | 🟡 HIGH | Must fix |
| 7 | Timeout not enforced → billing surprises | 🟡 HIGH | Must fix |
| 8 | No budget hard limits → unlimited costs | 🟡 HIGH | Must fix |
| 9 | No concurrency controls → resource exhaustion | 🟠 MEDIUM | Must fix |

---

## 🏗️ ARCHITECTURE OVERVIEW

### Security Layers

```
┌────────────────────────────────────────────────────────────┐
│                    ENSEMBLE SECURITY STACK                  │
│                                                             │
│  Layer 1: Docker Sandboxing (Hardened Container)           │
│  ├── No Docker socket                                     │
│  ├── Read-only filesystem                                  │
│  ├── Dropped capabilities                                  │
│  ├── seccomp profiles                                      │
│  └── Resource limits (CPU, memory, disk, time)             │
│                                                             │
│  Layer 2: AST Guard (Code Analysis)                        │
│  ├── Parse Python → AST                                    │
│  ├── Block dangerous builtins                             │
│  ├── Block dangerous modules                              │
│  ├── Detect obfuscation patterns                          │
│  └── Return security report                               │
│                                                             │
│  Layer 3: Network Policy Enforcement                       │
│  ├── iptables rules in container                           │
│  ├── DNS whitelist only                                    │
│  ├── All other traffic DROP                               │
│  └── Log blocked attempts                                  │
│                                                             │
│  Layer 4: Recursion Guard                                  │
│  ├── Track LLM call depth                                  │
│  ├── Hard limit: 3 levels                                  │
│  ├── Budget check before each call                        │
│  └── Raise RecursionError if exceeded                     │
│                                                             │
│  Layer 5: Storage Quotas                                  │
│  ├── Per-user storage limits                              │
│  ├── Per-agent venv size limits                           │
│  ├── Block expensive packages                             │
│  └── Warning when approaching limits                      │
│                                                             │
│  Layer 6: Input Limiters (Cost Control)                    │
│  ├── Estimate tokens before LLM call                      │
│  ├── Auto-truncate at 8000 tokens                         │
│  ├── Return summary + warning                             │
│  └── User can request full data                           │
│                                                             │
│  Layer 7: Timeout Enforcement                              │
│  ├── Hard Docker --timeout flag                           │
│  ├── Billing stops exactly at timeout                     │
│  ├── Container killed (not paused)                        │
│  └── Clear error messages                                 │
│                                                             │
│  Layer 8: Budget Hard Limits                               │
│  ├── Per-agent cost limits                                │
│  ├── Per-workflow total budget                            │
│  ├── Monthly account caps                                 │
│  └── Hard stop when limit reached                         │
│                                                             │
│  Layer 9: Concurrency Controls                             │
│  ├── Max parallel agents per tier                         │
│  ├── Max total execution time                             │
│  ├── Queue excess agents                                  │
│  └── Fair scheduling                                      │
└────────────────────────────────────────────────────────────┘
```

---

## 📋 IMPLEMENTATION PLAN

### Phase 1: Security Hardening (9 components)

#### 1. Docker Sandboxing
**File**: `core/docker_sandbox.py` (~300 lines)

**Purpose**: Prevent container escape and resource abuse

**Implementation**:
```python
class SecureDockerContainer:
    def __init__(self):
        self.seccomp_profile = {
            "defaultAction": "SCMP_ACT_ERRNO",
            "architectures": ["SCMP_ARCH_X86_64"],
            "syscalls": [
                {"names": ["read", "write", "exit", "mmap", ...], "action": "SCMP_ACT_ALLOW"}
                # Block: clone, unshare, mount, ptrace, etc.
            ]
        }
        
    def create_container(self, agent_code, limits):
        config = {
            "image": "ensemble-agent-runtime:latest",
            "command": ["python", "agent.py"],
            "security_opt": [
                f"seccomp={self.seccomp_profile}",
                "no-new-privileges=true"
            ],
            "cap_drop": ["ALL"],
            "cap_add": [],  # Nothing added back
            "read_only": True,
            "tmpfs": {"/tmp": "size=100M"},
            "volumes": {
                "/workspace": {"bind": "/workspace", "mode": "rw"}
            },
            "network_mode": "none",  # No network by default
            "cpu_quota": limits.get("cpu_quota", 200000),  # 2 cores max
            "mem_limit": limits.get("mem_limit", "512m"),
            "stop_timeout": 5  # Kill after 5s grace
        }
        return config
```

**Security Guarantees**:
- ❌ Cannot access Docker socket
- ❌ Cannot mount host filesystem
- ❌ Cannot create new processes outside container
- ❌ Cannot change UIDs/GIDs
- ❌ Cannot access host network
- ✅ Can read/write only to /workspace
- ✅ Can use CPU/memory within limits

---

#### 2. AST Guard
**File**: `core/security/ast_guard.py` (~350 lines)

**Purpose**: Block dangerous Python code patterns before execution

**Blocked Patterns**:
```python
# Direct imports
import os
import sys
import subprocess
import socket

# Dynamic imports
__import__('os')
getattr(__builtins__, '__import__')
eval("import os; os.system('rm -rf /')")
exec("code_here")

# File access
open('/etc/passwd')

# System access
os.system('...')
os.popen('...')
subprocess.run('...')

# Obfuscation detection
getattr(__import__('os'), 'system')('rm -rf /')
__builtins__['eval']('...')
```

**Implementation**:
```python
import ast

class SecurityViolation(Exception):
    def __init__(self, message, line_number, code_snippet):
        super().__init__(message)
        self.line_number = line_number
        self.code_snippet = code_snippet

class ASTSecurityAnalyzer(ast.NodeVisitor):
    BLOCKED_MODULES = {'os', 'sys', 'subprocess', 'socket', 'shutil', 'ctypes'}
    BLOCKED_BUILTINS = {'open', 'eval', 'exec', 'compile', '__import__', 'input', 'breakpoint'}
    
    def analyze(self, source_code: str) -> SecurityReport:
        tree = ast.parse(source_code)
        violations = []
        
        # Check imports
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in self.BLOCKED_MODULES:
                        violations.append(SecurityViolation(
                            f"Blocked module import: {alias.name}",
                            node.lineno,
                            f"import {alias.name}"
                        ))
            
            elif isinstance(node, ast.ImportFrom):
                if node.module in self.BLOCKED_MODULES:
                    violations.append(SecurityViolation(
                        f"Blocked module import: {node.module}",
                        node.lineno,
                        f"from {node.module} import ..."
                    ))
            
            # Check function calls
            elif isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    if node.func.id in self.BLOCKED_BUILTINS:
                        violations.append(SecurityViolation(
                            f"Blocked builtin function: {node.func.id}",
                            node.lineno,
                            f"{node.func.id}(...)"
                        ))
                
                # Detect getattr(__builtins__, 'eval') pattern
                elif isinstance(node.func, ast.Attribute):
                    if isinstance(node.func.value, ast.Name):
                        if node.func.value.id == '__builtins__':
                            violations.append(SecurityViolation(
                                "Blocked __builtins__ access",
                                node.lineno,
                                "__builtins__.attr"
                            ))
        
        return SecurityReport(
            is_safe=len(violations) == 0,
            violations=violations,
            total_nodes=len(list(ast.walk(tree)))
        )
```

---

#### 3. Network Policy Enforcement
**File**: `core/security/network_policy.py` (~200 lines)

**Purpose**: Enforce domain whitelist via iptables

**Implementation**:
```python
class NetworkPolicyEnforcer:
    def __init__(self):
        self.default_policy = "DROP"
        self.whitelist = []
    
    def create_iptables_rules(self, allowed_domains: list) -> str:
        """Generate iptables rules for container network policy"""
        rules = []
        
        # Default: DROP all outbound
        rules.append("iptables -P OUTPUT DROP")
        
        # Allow loopback
        rules.append("iptables -A OUTPUT -o lo -j ACCEPT")
        
        # Allow DNS to specific resolvers
        rules.append("iptables -A OUTPUT -p udp --dport 53 -d 8.8.8.8 -j ACCEPT")
        rules.append("iptables -A OUTPUT -p tcp --dport 53 -d 8.8.8.8 -j ACCEPT")
        
        # Resolve domains to IPs and whitelist
        for domain in allowed_domains:
            try:
                import socket
                ip = socket.gethostbyname(domain)
                rules.append(f"iptables -A OUTPUT -d {ip} -j ACCEPT")
            except:
                pass
        
        # Log dropped packets
        rules.append("iptables -A OUTPUT -j LOG --log-prefix 'BLOCKED: '")
        rules.append("iptables -A OUTPUT -j DROP")
        
        return "\n".join(rules)
```

---

#### 4. Recursion Guard
**File**: `core/security/recursion_guard.py` (~150 lines)

**Purpose**: Prevent infinite LLM/agent recursion

**Implementation**:
```python
class RecursionGuard:
    def __init__(self, max_depth=3, max_total_cost=10.0):
        self.call_stack = []
        self.max_depth = max_depth
        self.max_total_cost = max_total_cost
        self.total_cost = 0.0
    
    def check_before_call(self, agent_id, estimated_cost):
        # Check depth
        if len(self.call_stack) >= self.max_depth:
            raise RecursionError(
                f"Max recursion depth exceeded ({self.max_depth}). "
                f"Current depth: {len(self.call_stack)}"
            )
        
        # Check budget
        if self.total_cost + estimated_cost > self.max_total_cost:
            raise BudgetExceeded(
                f"Call would exceed budget limit of ${self.max_total_cost}. "
                f"Current cost: ${self.total_cost:.4f}, Estimated: ${estimated_cost:.4f}"
            )
        
        # Track call
        self.call_stack.append({
            'agent_id': agent_id,
            'cost': estimated_cost,
            'timestamp': datetime.now()
        })
        self.total_cost += estimated_cost
    
    def pop_call(self):
        if self.call_stack:
            call = self.call_stack.pop()
            # Adjust cost if actual differs from estimate
            return call
```

---

#### 5. Storage Quota Manager
**File**: `core/security/storage_quota.py` (~200 lines)

**Purpose**: Enforce per-user storage & dependency limits

**Implementation**:
```python
class StorageQuotaManager:
    QUOTA_LIMITS = {
        'free': {
            'total_storage': 5 * 1024 * 1024 * 1024,  # 5GB
            'max_venv_size': 500 * 1024 * 1024,       # 500MB
            'max_packages': 50,
            'blocked_packages': ['tensorflow', 'pytorch', 'cuda']
        },
        'pro': {
            'total_storage': 50 * 1024 * 1024 * 1024,  # 50GB
            'max_venv_size': 1024 * 1024 * 1024,       # 1GB
            'max_packages': 100,
            'blocked_packages': []
        },
        'enterprise': {
            'total_storage': 500 * 1024 * 1024 * 1024,  # 500GB
            'max_venv_size': 5 * 1024 * 1024 * 1024,    # 5GB
            'max_packages': 500,
            'blocked_packages': []
        }
    }
    
    def check_dependencies(self, requirements: list, tier: str) -> DependencyReport:
        """Check if dependencies are within limits"""
        quota = self.QUOTA_LIMITS[tier]
        violations = []
        
        for package in requirements:
            if package in quota['blocked_packages']:
                violations.append(f"Blocked package: {package}")
        
        if len(requirements) > quota['max_packages']:
            violations.append(f"Too many packages: {len(requirements)} > {quota['max_packages']}")
        
        return DependencyReport(
            is_allowed=len(violations) == 0,
            violations=violations,
            estimated_size=self.estimate_install_size(requirements)
        )
```

---

### Phase 2: Cost Controls (4 components)

#### 6. Input Limiter
**File**: `core/cost_control/input_limiter.py` (~150 lines)

**Purpose**: Prevent LLM token explosions from large inputs

**Implementation**:
```python
class InputLimiter:
    MAX_TOKENS = 8000  # ~32KB
    ESTIMATE_CHARS_PER_TOKEN = 4
    
    def prepare_for_llm(self, data, format="auto"):
        # Convert to string if needed
        text = self._convert_to_text(data, format)
        
        # Estimate tokens
        token_count = len(text) // self.ESTIMATE_CHARS_PER_TOKEN
        
        if token_count <= self.MAX_TOKENS:
            return InputResult(
                data=text,
                token_count=token_count,
                truncated=False
            )
        
        # Truncate with summary
        summary = self._generate_summary(text, max_tokens=2000)
        return InputResult(
            data=summary,
            token_count=len(summary) // self.ESTIMATE_CHARS_PER_TOKEN,
            truncated=True,
            original_size=len(text),
            original_token_count=token_count,
            message=f"Input truncated from {token_count} to {self.MAX_TOKENS} tokens. Use full_data endpoint if needed."
        )
```

---

#### 7. Timeout Manager
**File**: `core/cost_control/timeout_manager.py` (~150 lines)

**Purpose**: Hard timeout enforcement with precise billing

**Implementation**:
```python
class TimeoutEnforcer:
    DEFAULT_TIMEOUT = 60  # seconds
    HARD_LIMIT = 300      # absolute max
    
    def execute_with_timeout(self, func, timeout=None):
        timeout = min(timeout or self.DEFAULT_TIMEOUT, self.HARD_LIMIT)
        
        start_time = time.time()
        try:
            # Use signal alarm or asyncio timeout
            result = asyncio.wait_for(func(), timeout=timeout)
            elapsed = time.time() - start_time
            return ExecutionResult(
                result=result,
                duration=elapsed,
                status="success"
            )
        except asyncio.TimeoutError:
            elapsed = time.time() - start_time
            # Billing stops exactly at timeout
            return ExecutionResult(
                result=None,
                duration=timeout,  # NOT elapsed
                status="timeout",
                message=f"Execution terminated after {timeout}s timeout"
            )
```

---

#### 8. Budget Enforcer
**File**: `core/cost_control/budget_enforcer.py` (~200 lines)

**Purpose**: Hard budget limits that cannot be exceeded

**Implementation**:
```python
class BudgetEnforcer:
    def check_budget(self, agent_id, estimated_cost):
        budget = self.get_budget(agent_id)
        
        if budget.spent + budget.escrowed + estimated_cost > budget.limit:
            return BudgetCheckResult(
                allowed=False,
                reason=f"Would exceed budget. Limit: ${budget.limit}, Spent: ${budget.spent}, Escrowed: ${budget.escrowed}, Requested: ${estimated_cost}"
            )
        
        # Reserve the funds
        budget.escrowed += estimated_cost
        return BudgetCheckResult(allowed=True, escrowed=estimated_cost)
    
    def confirm_execution(self, agent_id, actual_cost):
        budget = self.get_budget(agent_id)
        budget.escrowed -= estimated_cost
        budget.spent += actual_cost
        
        if budget.spent > budget.limit:
            # This should never happen due to checks above
            raise BudgetViolationError("CRITICAL: Budget exceeded after execution!")
```

---

#### 9. Concurrency Manager
**File**: `core/cost_control/concurrency_manager.py` (~150 lines)

**Purpose**: Control parallel execution limits

**Implementation**:
```python
class ConcurrencyManager:
    LIMITS = {
        'free': {'max_parallel': 2, 'max_queue': 10},
        'pro': {'max_parallel': 10, 'max_queue': 50},
        'enterprise': {'max_parallel': 50, 'max_queue': 200}
    }
    
    async def acquire_slot(self, tier):
        limits = self.LIMITS[tier]
        
        if self.active_count >= limits['max_parallel']:
            if self.queue_count >= limits['max_queue']:
                raise ConcurrencyError(f"Queue full ({limits['max_queue']}). Try again later.")
            
            # Wait in queue
            await self.queue.acquire()
        
        self.active_count += 1
        return ExecutionSlot(slot_id=uuid.uuid4())
    
    def release_slot(self, slot):
        self.active_count -= 1
        if self.queue_count > 0:
            self.queue.release()
```

---

## 🧪 TESTING STRATEGY

### Security Tests (30 tests)
```python
class TestDockerSandbox:
    def test_cannot_access_docker_socket(self)
    def test_cannot_mount_host_filesystem(self)
    def test_read_only_filesystem(self)
    def test_network_isolation(self)
    def test_cpu_limit_enforced(self)
    def test_memory_limit_enforced(self)

class TestASTGuard:
    def test_blocks_import_os(self)
    def test_blocks_import_subprocess(self)
    def test_blocks_eval(self)
    def test_blocks_exec(self)
    def test_blocks_dynamic_import(self)
    def test_detects_obfuscation(self)
    def test_allows_safe_imports(self)
    def test_allows_math_operations(self)

class TestNetworkPolicy:
    def test_whitelist_enforced(self)
    def test_non_whitelisted_blocked(self)
    def test_dns_resolution_works(self)

class TestRecursionGuard:
    def test_blocks_depth_4(self)
    def test_allows_depth_3(self)
    def test_budget_check_before_call(self)

class TestStorageQuota:
    def test_blocks_tensorflow_on_free_tier(self)
    def test_allows_on_pro_tier(self)
    def test_enforces_venv_size_limit(self)
```

### Cost Control Tests (20 tests)
```python
class TestInputLimiter:
    def test_truncates_large_input(self)
    def test_preserves_small_input(self)
    def test_estimates_tokens_accurately(self)

class TestTimeoutManager:
    def test_kills_at_timeout(self)
    def test_billing_stops_at_timeout(self)
    def test_hard_limit_enforced(self)

class TestBudgetEnforcer:
    def test_blocks_over_budget(self)
    def test_allows_within_budget(self)
    def test_escrow_management(self)

class TestConcurrencyManager:
    def test_limits_parallel_agents(self)
    def test_queues_excess(self)
    def test_releases_slots(self)
```

---

## 📊 EXPECTED OUTCOMES

### Before Implementation
- ❌ Docker escape possible
- ❌ No code security scanning
- ❌ Network access unrestricted
- ❌ Infinite recursion possible
- ❌ Unlimited storage usage
- ❌ LLM token explosions
- ❌ Timeout billing surprises
- ❌ No budget hard limits
- ❌ Unbounded concurrency

### After Implementation
- ✅ Container escape impossible
- ✅ All Python code scanned before execution
- ✅ Network restricted to whitelist
- ✅ Recursion limited to 3 levels
- ✅ Storage quotas enforced
- ✅ LLM inputs truncated automatically
- ✅ Hard timeouts with precise billing
- ✅ Budget limits cannot be exceeded
- ✅ Concurrency controlled per tier

---

## 🚀 DEPLOYMENT PLAN

### Step 1: Write Code (2 weeks)
- All 9 components implemented
- Comprehensive test suite (50 tests)
- Integration with existing codebase

### Step 2: Internal Testing (1 week)
- Security penetration testing
- Load testing with malicious inputs
- Budget control validation
- Performance impact assessment

### Step 3: Staged Rollout (1 week)
- Deploy to staging environment
- Test with sample agent imports
- Monitor security logs
- Gather user feedback

### Step 4: Production (1 day)
- Full deployment
- Monitoring dashboards
- Alert configuration
- Documentation update

---

## 📈 SUCCESS METRICS

| Metric | Target |
|--------|--------|
| Security violations caught | 100% |
| False positive rate | <1% |
| Performance overhead | <10% |
| Budget violation prevention | 100% |
| User satisfaction | >90% |

---

## 🔮 FUTURE ENHANCEMENTS

After security foundation is solid:
1. Universal Agent Importer (Phase 3)
2. gVisor/Kata container support for stronger isolation
3. Automated security scanning on imported repos
4. Community trust scoring
5. Agent certification program
6. Advanced threat detection (ML-based anomaly detection)

---

**Document Created**: April 10, 2026  
**Status**: ✅ Approved for Implementation  
**Next Step**: Begin Phase 1 implementation
