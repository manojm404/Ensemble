# Executive Summary: Ensemble ↔ agency-agents Integration

## The Short Version

**YES** - We can integrate all 182 agents from the `wshobson/agents` repository into our Marketplace UI as auto-updating downloadable packs.

---

## Key Findings

### What We Have (Ensemble)
- ✅ Full-stack platform with React + Tauri UI
- ✅ Marketplace with install/update/rollback already working
- ✅ 186 native agents in `skills/` directory
- ✅ Multi-provider LLM support (Gemini, Ollama, OpenAI)
- ✅ Token budget system with audit logging
- ✅ Content-Addressable Storage (CAS) for version control

### What They Have (agency-agents)
- 📦 182 specialized agents across 24 categories
- 📦 77 plugins with progressive disclosure (3-tier loading)
- 📦 Model tier system (Opus/Sonnet/Haiku assignment)
- 📦 PluginEval quality certification (Bronze → Platinum)
- 📦 CLI-only interface (no GUI)
- 📦 Anthropic-only LLM support

---

## The Problems We Need to Solve

### 🔴 Critical Issues

1. **Double Agents**: Same-function agents from different sources
   - *Example*: We have `code-reviewer.md`, they have `code-reviewer.md`
   - **Solution**: Namespace isolation `[NATIVE]`, `[PACK:xxx]`, `[CUSTOM]`

2. **Version Conflicts**: Different versions of same agent
   - *Solution*: Manifest lock with SHA-256 + archive system (already in place!)

3. **Model Incompatibility**: Their agents expect Anthropic models
   - *Solution*: Agent-level model override in frontmatter

### 🟡 Medium Issues

4. **No Quality Gates**: We accept any pack without validation
   - *Solution*: Implement simplified PluginEval

5. **Manual Updates**: No auto-update mechanism
   - *Solution*: Background polling service with WebSocket notifications

6. **Workflow Mismatch**: They use CLI commands, we use FSM/DAG
   - *Solution*: Command-to-SOP adapter layer

---

## How Auto-Updates Will Work

```
┌─────────────────────────────────────────────────┐
│ 1. Background Service (hourly)                  │
│    Checks GitHub for new versions               │
│                                                  │
│ 2. If Update Found:                              │
│    → Notify UI via WebSocket                    │
│    → Show badge on pack card                    │
│                                                  │
│ 3. User Clicks "Update":                         │
│    → Archive current version                    │
│    → Download new ZIP from GitHub               │
│    → Extract & sync registry                    │
│    → Rollback available if needed               │
└─────────────────────────────────────────────────┘
```

---

## Implementation Timeline

| Phase | Duration | What Gets Built |
|-------|----------|-----------------|
| **1. Foundation** | 2 weeks | Namespace system, conflict detection, enhanced metadata |
| **2. Remote Integration** | 2 weeks | GitHub API connection, ZIP builder, manifest sync |
| **3. Auto-Update** | 1 week | Background service, notifications, UI indicators |
| **4. Quality Gates** | 1 week | Pack validation, badges, anti-pattern detection |
| **5. Model Mapping** | 1 week | Model overrides, tier migration, provider mapping |
| **6. Testing** | 1 week | Integration tests, UX polish, error handling |

**Total**: 8 weeks (part-time, single developer)

---

## Code Required

- **~2,300 lines** of new Python code
- **~500 lines** of TypeScript/React
- **6 new files**, **7 modified files**
- All new code goes in `core/` and `ui/src/`

---

## Risks & Mitigations

| Risk | Likelihood | Impact | How We Handle It |
|------|-----------|--------|------------------|
| GitHub API rate limits | Medium | Low | Caching + auth + exponential backoff |
| Auto-update breaks workflow | Medium | High | Manual approval by default |
| Agent conflicts confuse users | Medium | Medium | Clear UI with namespace badges |
| Repo goes private | Low | High | Local caching + mirrors |
| Large downloads fail | Low | Low | Streaming + progress indicators |

---

## Success Criteria

### Technical ✅
- Remote packs fetch in <3 seconds
- Update check <1 second (cached)
- Zero data loss during updates
- 100% rollback success

### User Experience ✅
- Install pack in 1 click
- Clear conflict resolution
- Update notification within 1 hour
- Quality badges visible before install

### Business 🎯
- 50+ packs in marketplace (Month 1)
- 80% of users install ≥1 external pack
- 60% update adoption within 7 days

---

## Recommendation

**Proceed with integration** using this approach:

1. ✅ Start with **curated subset** (10-20 high-value plugins)
2. ✅ Use **GitHub API** (not git submodules)
3. ✅ Implement **namespace isolation** first
4. ✅ Manual updates by default, auto-update opt-in
5. ✅ Add quality gates early to prevent bad packs

**Why this works**: We already have 80% of the infrastructure. The marketplace UI, install/rollback logic, and CAS system are all in place. We just need to add the remote source integration and conflict resolution layers.

---

## Next Actions

1. [ ] Review this document and approve approach
2. [ ] Begin Phase 1: Namespace system + conflict detection
3. [ ] Create `core/marketplace_sync.py` proof of concept
4. [ ] Test with 3-5 sample plugins from agency-agents
5. [ ] Iterate based on user feedback

---

*Bottom Line: This is absolutely achievable with our current architecture. The work is straightforward integration, not fundamental re-architecture.*
