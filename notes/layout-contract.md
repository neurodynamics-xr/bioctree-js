
## 1. Objective

Refactor the current app structure so that:

1. **Layout** becomes an explicit architectural layer responsible for **persistent screen scaffolding** (regions, docking, chrome, sizing, responsiveness).
2. **Pages** become explicit “screen-level compositions” responsible for **what renders inside those regions**, including viewer-specific panels, overlays, and state wiring.
3. `App.tsx` is simplified into an **application entry/controller** that selects which page is active (routing now or later).

This refactor must be **minimally invasive**, preserve existing UI behavior, and provide a foundation for future growth (multiple pages, routing, feature slicing).

---

## 2. Current State Summary

Current structure is centered around `src/app/App.tsx` functioning as:

* App bootstrapping and top-level UI assembly.
* Structural layout (left sidebar + canvas + right dock + toolbars).
* Viewer page composition and domain wiring.

No explicit `layouts/` or `pages/` layer exists. Components are grouped under:

* `src/app/components/*` for app-specific components
* `src/app/components/panels/*` for dock panels
* `src/app/components/ui/*` for design system (shadcn) components

---

## 3. Target Architecture

### 3.1 Folder Structure

Add two folders: `layouts` and `pages`.

```
src/
  app/
    App.tsx
    layouts/
      ViewerLayout.tsx
      AppLayout.tsx              (optional but recommended scaffold)
    pages/
      ViewerPage.tsx
      SettingsPage.tsx           (optional initially)
    components/
      ... (existing; unchanged for first pass)
  main.tsx
```

This preserves existing component paths and avoids churn while cleanly introducing the new layers.

### 3.2 Dependency Direction (Non-Negotiable)

To prevent architecture erosion and circular dependencies:

* `pages/*` may import from `layouts/*` and `components/*`.
* `layouts/*` may import from `components/*` and `components/ui/*`.
* `components/*` must **not** import from `pages/*` or `layouts/*`.

**Rationale:** layout defines scaffolding; pages define composition; components remain reusable.

---

## 4. Responsibilities and Boundaries

### 4.1 Layout Layer

**Purpose:** define *where* things go, not *what* they are.

Layouts:

* Create persistent regions: left / main / right / top / bottom / overlays / toasts.
* Own structural CSS (grid/flex), docking sizing, and responsive collapse rules.
* Optionally host section-level boundaries (ErrorBoundary, Suspense shells) if present.

Layouts must **not**:

* Decide which viewer panels exist (e.g., “show ManifoldPanel when X”).
* Fetch data or own domain state beyond basic UI layout state.
* Implement viewer logic (selection, brush, filters, etc.).

### 4.2 Pages Layer

**Purpose:** define *what* appears in layout regions and wire viewer state.

Pages:

* Compose panels and overlays.
* Bind app/viewer state, callbacks, and events.
* Choose which panels appear and how they are configured.
* Render the correct layout for the screen (ViewerLayout).

Pages are the correct place to:

* Decide which panels render in the right dock.
* Attach selection state to `SelectionChip`.
* Provide props to `CanvasContainer` / `ViewerCanvas`.

### 4.3 Components Layer

Components remain mostly unchanged for this refactor.

* `components/ui/*` stays as the design system layer.
* Viewer-specific building blocks stay in `components/*` for now.
* Long-term, feature slicing (e.g., `features/viewer/*`) is optional after this refactor.

---

## 5. Component Placement Mapping (First Pass)

### 5.1 ViewerLayout should host region slots for:

* Left rail / sidebar region: `LeftSidebar` (rendered as slot content)
* Main region: canvas + overlays (slot)
* Right dock region: `RightSidebarDock` / `DockPanel` (slot)
* Top region: `ToolOptionsBar` (slot, optional)
* Toast region: `ToolToast` / `Sonner` host (slot, optional)
* Overlays region: `OrientationCube`, `NavigationControls`, etc. (slot)

**Important:** ViewerLayout provides only the *structure*. It does not “know” specific panels.

### 5.2 ViewerPage should compose and pass into ViewerLayout:

* `LeftSidebar`
* `CanvasContainer` + `ViewerCanvas`
* Panels under `components/panels/*`:

  * `BrushPanel`
  * `FieldsPanel`
  * `FiltersPanel`
  * `ManifoldPanel`
  * `ScenePanel`
* Overlay UI:

  * `Legend`
  * `StatusReadout`
  * `SelectionChip`
  * `OrientationCube`
  * `NavigationControls`
  * `TimeSeriesControls`
  * `BrushContextMenu`
* `ToolOptionsBar` and tool-specific options

### 5.3 App.tsx becomes a page switcher

Initially, it can render only the viewer:

* `return <ViewerPage />;`

Optionally introduce a simple “page mode” state machine:

* `'viewer' | 'settings' | 'about'`

No router required in this iteration.

---

## 6. New APIs and Contracts

### 6.1 ViewerLayout Slot Contract

Implement ViewerLayout as a slot-based scaffold.

**File:** `src/app/layouts/ViewerLayout.tsx`

**Props:**

* `left?: React.ReactNode`
* `main: React.ReactNode`
* `right?: React.ReactNode`
* `top?: React.ReactNode`
* `bottom?: React.ReactNode`
* `overlays?: React.ReactNode`
* `toasts?: React.ReactNode`
* `className?: string` (optional)
* Layout state props if needed (optional in v1):

  * `isLeftCollapsed?: boolean`
  * `onToggleLeft?: () => void`
  * `isRightCollapsed?: boolean`
  * `onToggleRight?: () => void`

**Behavior:**

* Render regions only if nodes exist.
* Maintain consistent region ordering and layering.
* The `overlays` region should render above `main` (e.g., absolute positioned).

**CSS/Layout Requirements:**

* Use existing styling patterns from `App.tsx` (copy and preserve).
* Avoid redesign. The goal is architectural separation, not UI change.

### 6.2 Optional AppLayout

**File:** `src/app/layouts/AppLayout.tsx` (optional for first pass)

Purpose:

* Host global providers and/or global UI portals.
* Provide consistent wrapper styling for pages.

If not needed, omit in first pass.

---

## 7. Implementation Steps (Agent Plan)

### Step 0 — Baseline

* Create a git branch for refactor.
* Confirm `App.tsx` currently renders expected UI.

### Step 1 — Create `ViewerLayout.tsx`

* Copy the structural wrapper JSX from `App.tsx` that controls:

  * left sidebar placement
  * main content region placement
  * right dock placement
  * options bars/toasts placement
* Replace hardcoded children with slots (`props.left`, `props.main`, etc.).
* Ensure all existing CSS classNames are preserved.
* Add overlay container (if not already explicit): typically absolute positioned inside main region.

**Acceptance criteria:**

* ViewerLayout compiles.
* No domain state in ViewerLayout beyond optional collapse flags.

### Step 2 — Create `ViewerPage.tsx`

* Move viewer-specific composition out of `App.tsx` into `ViewerPage.tsx`.
* `ViewerPage` imports `ViewerLayout` and passes slots.
* Move relevant state from `App.tsx` into `ViewerPage.tsx` if it is viewer-specific:

  * active tool state
  * selection state
  * tool option state
  * docking panel selection state (if any)
* Keep state names unchanged to reduce risk.

**Acceptance criteria:**

* ViewerPage renders identical UI to prior App.tsx behavior.

### Step 3 — Simplify `App.tsx`

Replace current content with one of:

**Option A (minimal):**

* `return <ViewerPage />;`

**Option B (supports multi-page without router):**

* maintain `activePage` state
* switch between `<ViewerPage />` and `<SettingsPage />` (optional)
* keep default as viewer

**Acceptance criteria:**

* App renders viewer exactly as before.

### Step 4 — (Optional) Introduce `SettingsPage.tsx`

If the app already supports a settings mode:

* Compose `SettingsPanel` into a simple layout (can reuse `ViewerLayout` with empty regions, or create `SimplePageLayout` later).
* Only do this if Settings is currently reachable in UI.

### Step 5 — Stabilize Imports / Paths

* Ensure no component imports `pages/*` or `layouts/*` incorrectly.
* Keep `components/ui/*` untouched.

### Step 6 — Regression Test Checklist

* Tools still switch correctly.
* Canvas still renders and receives pointer events.
* Right dock panels still appear and behave.
* Overlays still render above canvas (legend, cube, readouts).
* Context menus still attach correctly.
* Toast notifications still display (if used).

---

## 8. Non-Functional Requirements

### 8.1 No Visual Redesign

* Preserve styling, spacing, and behavior.
* Only refactor architecture.

### 8.2 No New Dependencies

* Do not introduce routing libraries in this iteration.
* Keep build stable.

### 8.3 Maintainability Goals

* Layout components remain simple and declarative.
* Pages own viewer composition and state wiring.
* Components remain reusable.

---

## 9. Deliverables

Agent must implement:

1. `src/app/layouts/ViewerLayout.tsx`
2. `src/app/pages/ViewerPage.tsx`
3. Updated `src/app/App.tsx` to render ViewerPage
4. (Optional) `src/app/layouts/AppLayout.tsx`
5. (Optional) `src/app/pages/SettingsPage.tsx`

Additionally:

* Update any imports impacted by the move.
* Ensure TypeScript types compile cleanly.

---

## 10. Acceptance Criteria (Definition of Done)

The refactor is considered complete when:

1. App compiles and runs without errors.
2. UI matches baseline behavior:

   * left sidebar, canvas, right dock, tool options, overlays, toasts all behave as before.
3. `ViewerLayout` contains **only** structural scaffolding and slot rendering.
4. `ViewerPage` owns viewer composition and state wiring.
5. `App.tsx` is minimal and page-oriented.
6. No circular dependency is introduced, and dependency direction rules are respected.

---

## 11. Notes for Future Iterations (Out of Scope Now)

After layouts/pages exist, you may later:

* Introduce a router (React Router / TanStack Router) or keep a state machine (MATLAB embedding).
* Feature-slice viewer into `features/viewer/*`.
* Formalize docking/regions and persist layout state.
* Add error/suspense boundaries per page section.

---

## 12. Agent Instructions (Operational)

* Do not rename existing components unless necessary.
* Do not change `components/ui/*`.
* Do not change behavior—only re-home code and introduce layout/page layers.
* Keep changes small and reviewable: prefer extracting code rather than rewriting.

If the agent needs to choose where to place any ambiguous component:

* If it primarily controls *screen structure* → layout
* If it primarily controls *viewer logic/composition* → page
* If it is reusable UI → components

