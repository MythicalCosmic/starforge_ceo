---
name: StarForge Leadership Workspace
description: A warm editorial operating system for permission-scoped organizational leadership.
colors:
  canvas: "#FBF6EC"
  surface: "#FFFCF5"
  surface-quiet: "#F4EBD8"
  surface-strong: "#EADFC4"
  ink: "#1F1B16"
  ink-secondary: "#3A332A"
  muted: "#786850"
  border: "#E5D9BE"
  border-strong: "#CFC0A0"
  primary: "#B85535"
  primary-hover: "#A04524"
  primary-soft: "#F3D9CC"
  accent: "#D89A2E"
  accent-soft: "#F6E4B8"
  success: "#4F7B3B"
  warning: "#9B6414"
  danger: "#B33A2A"
  dark-canvas: "#14110D"
  dark-surface: "#1D1914"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "'Manrope Variable', Aptos, 'Segoe UI', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(27px, 3vw, 40px)"
    fontWeight: 760
    lineHeight: 1.04
    letterSpacing: "-0.055em"
  body:
    fontFamily: "'Manrope Variable', Aptos, 'Segoe UI', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.6
  label:
    fontFamily: "'Manrope Variable', Aptos, 'Segoe UI', ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.07em"
  numeric:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, ui-monospace, monospace"
    fontWeight: 700
rounded:
  sm: "8px"
  control: "9px"
  md: "14px"
  lg: "22px"
  xl: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "36px"
  button-soft:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "7px 9px"
    height: "36px"
  status-pill:
    backgroundColor: "{colors.surface-quiet}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "4px 7px"
---

# Design System: StarForge Leadership Workspace

## Overview

**Creative North Star: "Warm Editorial Operations"**

StarForge leadership is a calm, information-dense operating environment rather than a decorative dashboard. Cream paper-like surfaces, dark ink, restrained terracotta and saffron, compact labels, and occasional serif display moments carry the shared StarForge family. Central Asian influence appears through the eight-point mark, palette names, and quiet geometry—not ornamental chrome.

This is the leadership expression of the family: desktop-first, evidence-forward, and explicit about scope. It may feel denser than staff clients, but should never become cramped, speculative, or visually detached from staff web and mobile.

The normative web token source is `src/styles/tokens.css`; V2 refinements such as translucent borders, radii, easing, and shallow shadows live in `src/styles/foundation-v2.css`. Palette and dark-mode changes must continue to flow through those variables.

**Key Characteristics:**

- Warm, editorial, and operational rather than promotional.
- Strong hierarchy for registers, comparisons, financial evidence, and governed actions.
- Restrained accent use, thin borders, and shallow depth.
- Permission scope, coverage, freshness, and service state remain visible.
- One visual family with staff web and Flutter, adapted to leadership density.

## Colors

Saroy is the default palette. Terracotta is the interactive voice, saffron is reserved for attention and AI-adjacent emphasis, and semantic green, amber, and red communicate real status rather than decoration.

### Primary

- **Saroy Terracotta:** Primary actions, active navigation, links, focus, selected records, and restrained emphasis.
- **Terracotta Soft:** Selected rows, active tabs, icon wells, and gentle focus support.

### Secondary

- **Saffron:** Attention, warm highlights, and the quiet AI treatment; it does not compete with the primary action.
- **Semantic Green / Amber / Red:** Success, warning, and destructive or critical states. Pair each foreground with its matching soft surface.

### Neutral

- **Warm Canvas / Cream Surface:** The page-ground and primary container pair.
- **Quiet / Strong Surface:** Controls, nested sections, selected backplates, and tonal separation.
- **Ink / Secondary Ink / Muted:** Main content, supporting content, and metadata respectively.
- **Border / Strong Border:** Default structure and stronger or dashed boundaries.

Marvarid (pearl and teal), Samarqand (indigo and saffron), and Daryo (sage and brass) are established user-selectable palettes in `src/styles/tokens.css`. Dark mode overlays the active palette; contributors must use semantic `--sf-*` tokens instead of hard-coded light values.

**The Semantic Color Rule.** A status color must mean the same thing across charts, pills, notices, and actions; never use danger or success merely for variety.

**The Palette Cascade Rule.** Add or change palette behavior in the token layer, not inside a page stylesheet.

## Typography

**Display Font:** Georgia with Times New Roman fallback.

**Body Font:** Manrope Variable with Aptos, Segoe UI, and system sans fallbacks.

**Label/Mono Font:** Cascadia Code with system monospace fallbacks.

Manrope carries almost all operating UI. Georgia is an editorial accent for selected feature or narrative moments, not a second interface font. Monospace is for identifiers and tabular data, with tabular numerals enabled where comparisons depend on alignment.

### Hierarchy

- **Display:** Serif, medium weight, tight leading; use sparingly for editorial feature moments.
- **Workspace headline:** Dense Manrope with a responsive size and tight tracking; one clear `h1` names the workspace.
- **Section title:** Compact, high-weight sans text, generally 12–18px depending on the container.
- **Body:** Compact but readable, usually 11–12.5px with generous line height for explanatory copy.
- **Label:** High-weight 11px text with tracked uppercase only for durable metadata categories, table headings, and short field labels.
- **Numeric:** Monospace or tabular numerals for money, counts, dates, identifiers, and aligned comparison values.

**The One Heading Rule.** A screen gets one visually dominant title; do not stack decorative eyebrow text above every heading. Existing accessible eyebrows may remain screen-reader context only.

## Layout

The application shell uses a persistent leadership sidebar and sticky masthead on wide screens, with the established shell preference able to select the alternate full-width navigation treatment. Main content is fluid up to 1680px with desktop page padding around 24–32px. At narrow widths the rail becomes a drawer and page layouts collapse deliberately.

Use the established 8-point rhythm as the baseline, with 4px adjustments for dense internal alignment. Prefer `minmax(0, 1fr)` for flexible columns and put `min-width: 0` on grid/flex children that hold translated names, money, or identifiers.

Resource workspaces use the `rv2-*` pattern: page header, view selector, search/toolbar, summary strip, register, state, pagination, and related-record sections. Desktop registers use semantic tables; at 760px and below they become tappable record cards instead of squeezing columns. Selected records and explicit action targets use the same primary-soft language.

Workforce screens build on `WorkspacePrimitives.jsx`: `WorkspaceHeader`, `FilterPanel`, `CoverageBar`, `WorkspaceTable`, `WorkspacePagination`, `ProfileHero`, `DetailSection`, `DetailGrid`, and `StatusPill`. `PeopleWorkspacePrimitives.jsx` owns person tabs and progressive filters. Workforce metrics collapse from four columns to two and then one; department comparisons switch from a wide table to paired mobile definition rows.

On mobile-width web, actionable controls inside resource and workforce surfaces must preserve at least 44px in each active dimension. Tables may scroll only when the data relationship truly requires a table; otherwise use the established card or definition-list transformation.

**The Register Transformation Rule.** Preserve data hierarchy across breakpoints; never make a desktop table merely smaller on a phone.

## Elevation & Depth

Depth is shallow and structural. Borders and tonal layering do most of the work; `--sf-v2-shadow` gives primary sections a quiet ambient lift, while larger shadows are reserved for dialogs, popovers, and focused overlays. Dark mode supplies its own shadow values.

Loading skeletons use tonal shimmer, and sticky navigation may use a modest backdrop blur. Both are progressive enhancement: content, border, and state meaning must remain legible without them.

**The Flat-by-Default Rule.** A nested card does not earn a stronger shadow simply because it is clickable; use border, tint, and focus first.

## Shapes

The form language is gently geometric: 8–10px for controls, 13–18px for operational cards and registers, 20–28px for larger heroes and overlays, and fully rounded pills only for compact status or filter tokens. The eight-point StarForge mark is the signature silhouette.

Thin borders are functional separators. Dashed borders identify loading/empty zones or invitation surfaces. Avoid arbitrary radius values when an existing token or nearby primitive already expresses the same hierarchy.

## Components

### Buttons

- **Primary:** Terracotta fill, cream text, compact high-weight label, and a subtle pressed scale.
- **Soft / Ghost:** Tonal or transparent surfaces with visible borders; use these for secondary actions.
- **Danger:** Soft red treatment for destructive intent; confirmation and backend validation still own safety.
- **Focus / disabled:** A visible primary-colored outline is mandatory. Disabled controls reduce opacity and do not pretend that a forbidden action succeeded.

### Cards / Containers

- Use `Card`, `DetailSection`, summary cards, or the resource/workforce container already matching the content type.
- Prefer tonal subdivision and one-pixel borders over nested shadows.
- Preserve header/body separation, internal padding, and overflow behavior from the primitive.

### Inputs / Filters

- Use shared form and filter primitives. Inputs are filled with a theme surface, receive a primary border plus soft ring on focus, and keep labels associated semantically.
- Keep primary filters visible and move secondary filters into the established progressive disclosure.
- Validation, permission, and service errors must remain distinct and appear near the affected task.

### Navigation

- The shell is the only global navigation authority. Section navigation may be sticky and horizontally scrollable; active items use primary-soft fill and `aria-current`.
- Icon-only controls require accessible names. Use the code-native icons in `src/components/Icons.jsx` and the shared StarForge SVG mark; do not add emoji or a second icon family.

### Resource and Workforce Primitives

- Extend `WorkspacePrimitives.jsx`, `PeopleWorkspacePrimitives.jsx`, `src/components/primitives.jsx`, `resource-v2.css`, `focused-v3.css`, or `workforce-v1.css` when a pattern recurs.
- Coverage bars state whether the visible result is complete, filtered, page-limited, or partial. Never imply completeness from loaded rows alone.
- Workspace states distinguish offline, loading, unavailable application, error with support reference/retry, and genuine empty results.
- Resource action targets make the selected record explicit before a mutation; mobile stacks the action full-width.

### Motion

State transitions are short and restrained, generally 80–220ms. Route, view, disclosure, and chart motion should explain a state change, never delay work. Every animated surface must honor `prefers-reduced-motion`; the established styles reduce duration to effectively instant and disable animated scrolling.

## Do's and Don'ts

### Do:

- **Do** use semantic `--sf-*` and V2 foundation variables as the source of palette, surface, focus, and depth truth.
- **Do** extend the shared workspace/resource/workforce primitives before adding a page-specific card, filter, table, state, or button.
- **Do** keep backend scope, freshness, coverage, and permission boundaries visible near the evidence or action they qualify.
- **Do** preserve keyboard navigation, semantic tables/forms, visible focus, robust wrapping, reduced motion, and 44px mobile targets.
- **Do** format money, dates, counts, and identifiers with the established formatters and tabular/monospace treatment where comparison benefits.

### Don't:

- **Don't** infer hidden totals, generic staff salary, permissions, or cross-branch completeness from partial client data.
- **Don't** hard-code a light palette value into a component that must respond to palette or dark mode.
- **Don't** add decorative eyebrow labels, emoji icons, loud gradients, or deep shadow stacks to make dense screens feel important.
- **Don't** collapse loading, empty, permission-denied, offline, stale, and service-failure states into one generic blank panel.
- **Don't** create one-off visual primitives when an existing component can be extended without changing its established contract.
