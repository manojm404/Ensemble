# Ensemble — Architecture & Technical Documentation

> **Ensemble** is a Collaborative OS for Multi-Agent Workflows.
> It lets users chat with AI agents, build visual automation pipelines, manage permissions, and orchestrate complex multi-step tasks — all from a browser-based desktop-style interface.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Architecture Overview](#architecture-overview)
4. [Design System](#design-system)
5. [Routing & Navigation](#routing--navigation)
6. [Feature Modules](#feature-modules)
7. [Data Layer & Mocking Strategy](#data-layer--mocking-strategy)
8. [Component Patterns](#component-patterns)
9. [Animation System](#animation-system)
10. [What's Mocked vs. Production-Ready](#whats-mocked-vs-production-ready)
11. [Future Integration Points](#future-integration-points)

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | React 18 | Component model, hooks, concurrent features, massive ecosystem |
| **Build Tool** | Vite 5 | Instant HMR, fast cold starts, native ESM — best DX for SPAs |
| **Language** | TypeScript 5 | Type safety across the entire codebase, better refactoring |
| **Styling** | Tailwind CSS v3 | Utility-first, design-token integration via CSS variables, zero runtime cost |
| **UI Components** | shadcn/ui (Radix primitives) | Accessible, unstyled headless components with full control over design |
| **Animations** | Framer Motion 11 | Declarative layout animations, spring physics, AnimatePresence for exit animations |
| **Routing** | React Router v6 | Nested layouts, outlet-based page composition, URL-driven navigation |
| **State** | React useState/useContext | Lightweight — no external state library needed at current scale |
| **Data Fetching** | TanStack React Query v5 | Cache management, background refetching (installed, ready for backend integration) |
| **Canvas/Graph** | React Flow 11 | Node-based workflow editor with built-in pan/zoom, minimap, controls |
| **Toasts** | Sonner | Stacked, auto-dismissing toast notifications with rich content |
| **Icons** | Lucide React | Tree-shakeable, consistent 24×24 icon set |

### Why NOT other choices?

- **No Next.js/SSR**: This is a desktop-style SPA — no SEO needed, no server rendering. Vite is faster for pure client apps.
- **No Redux/Zustand**: Local state + context is sufficient. Adding a store would be premature at this scale.
- **No CSS-in-JS**: Tailwind is faster (zero runtime), more predictable, and integrates perfectly with the design token system.
- **No D3 for charts**: The dashboard bar chart is simple enough for CSS — D3 would be overkill.

---

## Project Structure

```
src/
├── App.tsx                    # Root: providers, router, layout
├── main.tsx                   # Entry point — mounts React
├── index.css                  # Global styles, CSS custom properties (design tokens)
│
├── pages/                     # Route-level components (one per URL)
│   ├── Index.tsx              # Dashboard — stats, activity chart, recent workflows
│   ├── Chat.tsx               # Chat workspace — thin wrapper for ChatView
│   ├── Agents.tsx             # Agent registry — grid + category sidebar
│   ├── Workflows.tsx          # Workflow list — cards with status badges
│   ├── WorkflowEditor.tsx     # Canvas editor — React Flow + toolbar + execution panel
│   ├── Macros.tsx             # Macro marketplace — template cards
│   ├── MacroDetail.tsx        # Single macro detail — overview, agents, config
│   ├── Permissions.tsx        # Permission matrix — table + egress whitelist
│   ├── Settings.tsx           # Settings hub — 14 sub-pages via nested Routes
│   ├── Auth.tsx               # Login/signup — form + social auth
│   ├── Launcher.tsx           # New tab launcher — app grid
│   ├── ExternalApp.tsx        # Iframe container for external AI apps
│   └── NotFound.tsx           # 404 page
│
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx      # Shell: TopBar + main content area + page transitions
│   │   ├── TopBar.tsx         # Chrome-style tab bar + AI apps grid + user menu
│   │   └── InspectorPanel.tsx # Slide-out right panel for entity details
│   │
│   ├── chat/
│   │   ├── ChatView.tsx       # Chat orchestrator — sidebar + messages + input
│   │   ├── ChatInput.tsx      # Rich input — slash commands, @models, phrases, knowledge
│   │   ├── ChatMessage.tsx    # Single message bubble (user/assistant)
│   │   ├── ConversationList.tsx # Topic sidebar with agent picker
│   │   ├── TopicSearchDialog.tsx # Cmd+K style topic search
│   │   └── AssistantSettingsDialog.tsx # 6-tab assistant config dialog
│   │
│   ├── workflow/
│   │   ├── WorkflowExecutionPanel.tsx # Right panel: task input → execution → results
│   │   ├── AgentStepTracker.tsx       # Vertical timeline of agent execution steps
│   │   ├── OutputViewer.tsx           # Tabbed viewer: Document/Files/Preview
│   │   └── MagicWandDialog.tsx        # AI workflow generation dialog
│   │
│   ├── settings/
│   │   ├── ProvidersSettings.tsx      # Model provider configuration
│   │   ├── QuickAssistantSettings.tsx # Floating quick assistant config
│   │   └── SelectionAssistantSettings.tsx # Text selection AI config
│   │
│   ├── home/
│   │   └── AddCustomAppDialog.tsx     # Dialog to add custom AI app URLs
│   │
│   ├── icons/
│   │   └── ai-logos.tsx               # SVG logo components for AI services
│   │
│   └── ui/                            # shadcn/ui primitives (DO NOT modify styling)
│       ├── button.tsx, dialog.tsx, tabs.tsx, etc.
│       └── motion-card.tsx            # Custom animated card with stagger support
│
├── lib/
│   ├── api.ts                 # API stubs — mock data, simulated CRUD
│   ├── agents.ts              # Agent definitions — types + default agent list
│   ├── agent-metadata.ts      # Emoji/category metadata for agents
│   ├── ai-apps.ts             # AI app registry (ChatGPT, Claude, Gemini, etc.)
│   ├── tab-context.tsx        # Tab state provider — browser-style tab management
│   ├── workflow-generator.ts  # AI workflow generation from natural language
│   └── utils.ts               # cn() helper for class merging
│
└── hooks/
    ├── use-mobile.tsx         # Responsive breakpoint hook
    └── use-toast.ts           # Legacy toast hook (prefer sonner)
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      App.tsx                            │
│  QueryClientProvider → TooltipProvider → BrowserRouter  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              AppLayout.tsx                       │   │
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │            TopBar.tsx                     │   │   │
│  │  │  [Grid] [Tab] [Tab] [Tab] [+]    [☀] [⚙] [👤]│  │   │
│  │  └──────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │       AnimatePresence + Outlet           │   │   │
│  │  │  ┌──────────────────────────────────┐    │   │   │
│  │  │  │        Page Component            │    │   │   │
│  │  │  │   (Index/Chat/Agents/etc.)       │    │   │   │
│  │  │  └──────────────────────────────────┘    │   │   │
│  │  └──────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **Tab-based navigation** (like Chrome/VS Code): Users open apps as tabs. Each tab maps to a route. This enables multi-tasking — keep Chat open while switching to Workflows.

2. **Context-driven state**: `TabContext` manages open tabs globally. `InspectorProvider` manages the right-side detail panel. No prop drilling for cross-cutting concerns.

3. **Page-level composition**: Each page is self-contained. Pages own their local state (search filters, form values, dialog states). No shared global form state.

4. **Animation-first transitions**: Every page transition uses `AnimatePresence` with `mode="wait"` for smooth crossfades. Cards use staggered entry animations.

---

## Design System

### CSS Custom Properties (index.css)

All colors are defined as HSL values in `:root` (light) and `.dark` (dark mode):

```css
--background: 220 20% 7%;       /* Deep navy-black */
--foreground: 210 20% 92%;      /* Soft white */
--primary: 195 90% 50%;         /* Cyan accent */
--card: 220 16% 11%;            /* Elevated surface */
--muted: 215 15% 55%;           /* Subdued text */
```

### Tailwind Integration

Colors are mapped in `tailwind.config.ts`:
```ts
colors: {
  primary: "hsl(var(--primary))",
  background: "hsl(var(--background))",
  // ...semantic tokens
}
```

### Custom Design Tokens

| Token | Usage |
|-------|-------|
| `glow-primary` | Subtle cyan box-shadow on hover states |
| `glass` | `bg-card/80 backdrop-blur-xl border border-border/50` — glassmorphic panels |
| `badge-*` | Category-specific colors (green, blue, orange, red, purple) |

### Typography

- **Body**: System font stack via Tailwind defaults
- **Mono**: `font-mono` for code blocks, API keys, keyboard shortcuts
- **Scale**: `text-[10px]` for micro labels, `text-xs` for metadata, `text-sm` for body, `text-lg`/`text-2xl` for headings

---

## Routing & Navigation

```
/                    → Dashboard (Index.tsx)
/chat                → Chat workspace
/launcher            → New tab app picker
/app/:appId          → External AI app iframe
/agents              → Agent registry
/workflows           → Workflow list
/workflows/:id       → Workflow canvas editor
/workflows/new       → New workflow (empty canvas)
/macros              → Macro marketplace
/macros/:id          → Macro detail page
/permissions         → Permission matrix
/settings/*          → Settings (14 sub-routes)
/auth                → Login/signup (outside AppLayout)
```

All routes except `/auth` are wrapped in `AppLayout` which provides the tab bar and page transition shell.

---

## Feature Modules

### 1. Chat System

**Files**: `ChatView.tsx`, `ChatInput.tsx`, `ChatMessage.tsx`, `ConversationList.tsx`, `AssistantSettingsDialog.tsx`

- Default agent: "Ensemble AI Assistant" (customizable name, emoji, model, prompt)
- Agent switching: `/` slash command in input OR sidebar agent picker
- Model switching: `@` command in input OR model badge click
- Input features: file/image attach, emoji, web search toggle, expand/collapse, quick phrases, knowledge base
- Conversations stored in local state (mock — ready for database)

### 2. Workflow Canvas

**Files**: `WorkflowEditor.tsx`, `WorkflowExecutionPanel.tsx`, `AgentStepTracker.tsx`, `OutputViewer.tsx`

- **React Flow** canvas with custom `AgentNode` components
- Floating bottom toolbar: name, AI generate, add agent, undo/redo, save, run
- **Execution pipeline**: Sequential agent execution with topological sort
- **Output viewer**: Three tabs — Document (markdown), Files (tree explorer), Preview (iframe)
- Node inspector: Model, temperature, system prompt per agent

### 3. Agent Registry

**Files**: `Agents.tsx`

- Category sidebar filter (Programming, Writing, Analysis, Design, DevOps)
- Create agent dialog (name, prompt, model, category, temperature)
- Click-to-inspect: opens right panel with agent details

### 4. Macro Marketplace

**Files**: `Macros.tsx`, `MacroDetail.tsx`

- Template cards with stars, forks, category badges
- Detail page: Overview, Agent pipeline visualization, Configure tab
- Actions: Use Template (→ workflow editor), Fork, Run with Config

### 5. Permission Matrix

**Files**: `Permissions.tsx`

- Toggle switches for Read/Write/Execute/Network per agent
- Egress whitelist: Add/remove allowed domains

### 6. Settings

**Files**: `Settings.tsx`, `ProvidersSettings.tsx`, `QuickAssistantSettings.tsx`, `SelectionAssistantSettings.tsx`

14 sub-pages covering: Model Provider, Default Model, General, Display, Data, MCP Servers, Web Search, Memories, API Server, Document Processing, Quick Phrases, Shortcuts, Quick Assistant, Selection Assistant, About.

---

## Data Layer & Mocking Strategy

### Current State: All data is mocked in-memory

| Data | Location | Mock Strategy |
|------|----------|---------------|
| Agents | `src/lib/api.ts` | Static array, `getAgents()` returns Promise |
| Workflows | `src/lib/api.ts` | `Map<string, WorkflowData>`, CRUD via `saveWorkflow()` |
| Conversations | `ChatView.tsx` | `useState` — local component state |
| Permissions | `Permissions.tsx` | `useState` — local component state |
| Settings | Each settings sub-page | `defaultValue` props — no persistence |
| Macros | `Macros.tsx` | Static array with hardcoded data |
| Dashboard stats | `Index.tsx` | Static arrays (stats, activityData, recentWorkflows) |
| AI Apps | `src/lib/ai-apps.ts` | Static list + localStorage for custom apps |

### To Replace with Real Backend

1. **Database**: Connect to Supabase/PostgreSQL for agents, workflows, conversations, permissions
2. **Auth**: Replace mock `handleSubmit` in `Auth.tsx` with Supabase Auth
3. **AI Calls**: Replace `setTimeout` mock responses in `ChatView.tsx` with real LLM API calls (via Edge Functions)
4. **File Storage**: Replace toast-only file attachments with Supabase Storage uploads
5. **Workflow Execution**: Replace `generateMockOutput()` with real agent orchestration

---

## Component Patterns

### 1. Motion Cards (Stagger Animation)

```tsx
<StaggerContainer className="grid grid-cols-3 gap-3">
  {items.map((item) => (
    <StaggerItem key={item.id}>
      <MotionCard>{/* content */}</MotionCard>
    </StaggerItem>
  ))}
</StaggerContainer>
```

### 2. Settings Fields

```tsx
<SettingsField label="Theme" description="Choose your preferred theme">
  <Select defaultValue="dark">...</Select>
</SettingsField>
```

### 3. Popup Menus (ChatInput)

Unified popup system: slash menu, model picker, phrases, knowledge base — all share the same `AnimatePresence` container and keyboard navigation logic.

### 4. Inspector Pattern

```tsx
const { open: openInspector } = useInspector();
openInspector("Title", <DetailContent />);
```

---

## Animation System

| Animation | Where | Type |
|-----------|-------|------|
| Page transitions | `AppLayout.tsx` | Fade + slide (y: 8px → 0) |
| Card stagger | All list pages | Stagger with 0.04s delay per item |
| Tab add/remove | `TopBar.tsx` | Spring layout animation |
| Dialog entry | All dialogs | Scale 0.95 → 1 + fade |
| Sidebar items | `ConversationList.tsx` | Slide-in from left (x: -12 → 0) |
| Toolbar | `WorkflowEditor.tsx` | Slide up (y: 20 → 0) |
| Empty state pulse | Canvas empty state | CSS `animate-ping` on background orb |
| Loader spinner | `Auth.tsx`, execution | Infinite rotation via Framer `animate` |

---

## What's Mocked vs. Production-Ready

### ✅ Production-Ready (UI/UX complete)

- Tab-based navigation system
- Agent category filtering & search
- Workflow canvas with node creation, connection, deletion
- Permission matrix toggle switches
- Settings layout with 14 sub-pages
- Chat input with slash commands, @models, quick phrases
- Responsive theme toggle (dark/light)

### 🔶 Mocked (functional UI, fake data)

- Chat responses (returns template string after 800ms delay)
- Workflow execution (simulated with `setTimeout`, generates fake markdown)
- File attachments (shows toast, doesn't upload)
- Dashboard statistics (static numbers)
- API server status (always shows "Running")
- Knowledge base items (shows toast, doesn't index)
- Social login (navigates after 1.2s delay)

### 🔲 Not Yet Implemented

- Real LLM API integration
- Database persistence (Supabase)
- User authentication (Supabase Auth)
- Real-time collaboration on workflows
- File upload & storage
- MCP server connections
- Webhook/API endpoints
- Billing & usage tracking

---

## Future Integration Points

### Supabase (Recommended Backend)

```
supabase/
├── auth          → User login, OAuth providers
├── database      → agents, workflows, conversations, permissions, settings
├── storage       → file attachments, knowledge base documents
├── edge-functions/
│   ├── chat      → Streaming LLM responses
│   ├── execute   → Workflow agent orchestration
│   └── webhook   → External integrations
```

### API Key Requirements

When connecting to real LLM providers, the app will need:
- OpenAI API key (GPT models)
- Anthropic API key (Claude models)
- Google AI API key (Gemini models)
- Optional: Tavily/SerpAPI for web search

These should be stored as server-side secrets (Supabase Vault or Edge Function env vars), never exposed to the client.

---

## Development Notes

### Running Locally

```bash
npm install
npm run dev      # Vite dev server on :5173
npm run build    # Production build
npm run test     # Vitest test suite
```

### Key Files to Never Modify (UI will break)

- `src/index.css` — Design tokens. Changing HSL values affects the entire app.
- `src/components/ui/*` — shadcn primitives. Modify via variants, not direct edits.
- `tailwind.config.ts` — Color mappings. Adding is fine, removing breaks classes.
- `src/components/layout/AppLayout.tsx` — Shell structure. Changing flex/overflow breaks layout.

### Adding a New Page

1. Create `src/pages/NewPage.tsx`
2. Add route in `src/App.tsx` inside the `<Route element={<AppLayout />}>` block
3. Add app entry in `src/lib/tab-context.tsx` → `allApps` array
4. The page will automatically appear in the Launcher grid

---

*Last updated: 2026-04-06 | Version: 0.1.0-alpha*
