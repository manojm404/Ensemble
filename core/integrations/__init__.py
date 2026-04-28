# Compatibility shim for integrations (try nested then flat)
try:
    from backend.ensemble.integrations.integrations import *
except Exception:
    from backend.ensemble.integrations import *
