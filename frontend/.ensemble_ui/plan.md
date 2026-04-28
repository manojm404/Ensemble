

# Open Workflow Output in a Separate Tab

## UX Analysis: Is This Good for Users?

**Yes, and here's why:**

Currently, workflow output (documents, file trees, previews) is crammed into the 380px-wide execution panel on the right side of the canvas. This is fine for status tracking, but terrible for actually *reading* a blog post, *browsing* 100+ generated files, or *previewing* a web app.

Opening output in a dedicated tab gives users:
- **Full-screen reading** — markdown documents get proper width instead of being squeezed
- **Side-by-side comparison** — keep the workflow canvas open in one tab, review output in another
- **Persistent access** — close the execution panel, come back to the output tab later
- **Consistent mental model** — everything in Ensemble already opens as tabs (Chat, Agents, Settings)

The execution panel should still show a compact summary + "Open in Tab" button, not lose the inline preview entirely.

## What Changes

### 1. New page: `src/pages/WorkflowOutput.tsx`
- A full-width page that renders the `OutputViewer` component
- Receives output data via route state or a shared context
- URL pattern: `/workflow-output/:workflowId`
- Shows the same 3-tab viewer (Document / Files / Preview) but at full width

### 2. New shared state: `src/lib/workflow-output-context.tsx`
- A simple context that stores the latest `WorkflowOutput` by workflow ID
- The execution panel writes output here when complete
- The output page reads from it

### 3. Modify `WorkflowExecutionPanel.tsx`
- Keep the inline output as a compact preview (first ~10 lines of markdown, file count badge)
- Add a prominent **"Open in Tab ↗"** button that:
  - Calls `openApp()` from tab-context to create a new tab
  - Navigates to `/workflow-output/:id`

### 4. Modify `src/lib/tab-context.tsx`
- No structural changes needed — `openApp()` already supports dynamic tabs

### 5. Add route in `App.tsx`
- Add `/workflow-output/:id` route pointing to the new page

## Layout

```text
Execution Panel (380px)              New Output Tab (full width)
┌──────────────────────┐            ┌──────────────────────────────────┐
│ ✅ Agent 1            │            │ [Document] [Files] [Preview]     │
│ ✅ Agent 2            │            │ ┌──────────────────────────────┐ │
│ ✅ Agent 3            │            │ │                              │ │
├──────────────────────┤            │ │  Full-width rendered          │ │
│ Results Summary      │            │ │  markdown / file explorer /   │ │
│ "Blog post: 1,200w"  │            │ │  live preview                │ │
│ [Open in Tab ↗]      │            │ │                              │ │
└──────────────────────┘            │ └──────────────────────────────┘ │
                                    └──────────────────────────────────┘
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/workflow-output-context.tsx` | Create — shared output store |
| `src/pages/WorkflowOutput.tsx` | Create — full-width output viewer page |
| `src/components/workflow/WorkflowExecutionPanel.tsx` | Modify — add compact summary + "Open in Tab" button |
| `src/App.tsx` | Modify — add route |

