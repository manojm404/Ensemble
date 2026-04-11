# Quick Reference: Namespace Badge System

## Visual Guide

### Badge Colors & Meanings

```
🔵 NATIVE       → Core system agents (protected)
🟦 CORE         → Legacy skills/ directory  
🟢 PACK:name    → Marketplace pack agents
🟡 CUSTOM       → User-created agents
🟣 INTEGRATION  → External repos (MetaGPT, etc.)
```

### Where Badges Appear

| Location | Size | Trigger | Shows |
|----------|------|---------|-------|
| **Agents Page - Cards** | sm | Hover | Namespace + pack ID |
| **Agents Page - Inspector** | md | Click | Namespace + pack ID |
| **Marketplace - Conflict Dialog** | sm | On conflict | Existing agent namespace |
| **Marketplace - Pack Cards** | xs | Always | Pack source (GitHub/Local) |

## Usage Examples

### In Agent Cards
```typescript
<NamespaceBadge 
  namespace={agent.namespace || "custom"} 
  packId={agent.pack_id}
  size="sm"
/>
```

### In Conflict Dialog
```typescript
{match.existing_agents.map(existing => (
  <NamespaceBadge 
    namespace={existing.namespace} 
    size="sm"
  />
))}
```

### In Inspector Panel
```typescript
<NamespaceBadge 
  namespace={agent.namespace || "native"} 
  packId={agent.pack_id}
  size="md"
/>
```

## CSS Classes

### Generated Output (Example)
```html
<!-- Native Badge -->
<span class="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1.5 text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">
  <span>🔵</span>
  <span>NATIVE</span>
</span>

<!-- Pack Badge with ID -->
<span class="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1.5 text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">
  <span>🟢</span>
  <span>PACK:game-dev-pack</span>
</span>

<!-- Custom Badge -->
<span class="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1.5 text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">
  <span>🟡</span>
  <span>CUSTOM</span>
</span>
```

## Backend Integration

### API Response Format
```json
{
  "id": "pack_game-dev-pack_unity_architect",
  "name": "Unity Architect",
  "namespace": "pack",
  "pack_id": "game-dev-pack",
  "source": "pack",
  "category": "engineering",
  "enabled": true
}
```

### Namespace Generation
```python
# Python backend (core/skill_registry.py)
def _generate_skill_id(filepath, source):
    if source == SkillSource.PACK:
        pack_id = extract_pack_id(filepath)
        return f"pack_{pack_id}_{category}_{filename}"
    elif source == SkillSource.NATIVE:
        return f"native_{category}_{filename}"
    # etc.
```

## Conflict Resolution Flow

```
User clicks Install
    ↓
Backend detects conflicts
    ↓
Returns conflict info:
{
  "status": "conflict",
  "conflicts": {
    "exact_matches": [
      {
        "file": "code-reviewer.md",
        "existing_agents": [
          {
            "id": "native_engineering_code_reviewer",
            "name": "Code Reviewer",
            "namespace": "native"  ← Used for badge
          }
        ]
      }
    ]
  }
}
    ↓
UI shows ConflictResolutionDialog
    ↓
User chooses: Skip / Replace / Cancel
    ↓
Backend applies resolution
    ↓
UI shows result toast
```

## Files Modified

| File | Changes | Purpose |
|------|---------|---------|
| `ui/src/pages/Marketplace.tsx` | +180 lines | Conflict dialog, namespace badges |
| `ui/src/pages/Agents.tsx` | +35 lines | Namespace badges |
| `ui/src/lib/api.ts` | +60 lines | New types, enhanced functions |
| `core/skill_registry.py` | +120 lines | Namespace system, conflict detection |
| `core/governance.py` | +130 lines | Enhanced install endpoint |

## Quick Testing Commands

### Frontend (Browser Console)
```javascript
// Check namespace badges are rendering
document.querySelectorAll('[class*="bg-blue-500/15"]').length

// Test conflict dialog (mock)
// (Will appear automatically when conflicts detected)
```

### Backend (Python)
```python
# Test namespace generation
from core.skill_registry import skill_registry
skill_registry.sync_all()
stats = skill_registry.get_namespace_stats()
print(f"Namespace stats: {stats}")

# Test conflict detection
test_agent = {
    "filepath": "data/agents/temp/code-reviewer.md",
    "name": "Code Reviewer",
    "description": "Reviews code"
}
conflicts = skill_registry.detect_conflicts([test_agent])
print(f"Conflicts: {conflicts}")
```

## Troubleshooting

### Badge Not Showing
**Check**:
1. Agent has `namespace` field in API response
2. Fallback logic: `agent.namespace || "custom"`
3. Browser console for CSS errors

### Wrong Color
**Verify**:
1. Namespace value matches config keys
2. Check for typos: "native" not "Native"
3. Inspect element to see generated classes

### Conflict Dialog Not Appearing
**Ensure**:
1. Backend returns `status: "conflict"`
2. `conflicts` object is populated
3. `conflictDialogOpen` state is set to `true`

---

*Quick Reference v1.0 - April 10, 2026*
