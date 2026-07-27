# StarForge Executive Console — Design Foundation V1

This document preserves the first production-oriented visual foundation as a
reference while the active console moves to the V2 experience. It is a design
record, not an alternate runtime theme or a bundle of dead application code.

## Product boundary

- Audience: chief executives and department managers.
- Authorization: the interface reflects the active director or department-head
  membership; it never broadens the permissions returned by StarForge.
- Data principle: business values come from the authenticated organization
  records. Missing values remain unknown instead of being invented.

## Visual character

V1 established a warm editorial direction inspired by Central Asian materials:
cream surfaces, terracotta actions, saffron highlights, restrained serif
accents, and quiet geometric details.

### Typography

- Interface: Manrope Variable.
- Editorial accent: Newsreader Variable Italic.
- Numeric and identifier values: Cascadia Code / system monospace.

### Core palette

| Token | V1 value | Purpose |
| --- | --- | --- |
| Background | `#FBF6EC` | Warm page canvas |
| Surface | `#FFFCF5` | Primary cards and panels |
| Secondary surface | `#F4EBD8` | Inputs and quiet controls |
| Ink | `#1F1B16` | Primary text |
| Muted | `#847663` | Supporting text |
| Border | `#E5D9BE` | Surface separation |
| Terracotta | `#B85535` | Primary action and active state |
| Saffron | `#D89A2E` | Emphasis and attention |
| Success | `#4F7B3B` | Positive status |
| Warning | `#C68423` | Needs attention |
| Danger | `#B33A2A` | Destructive or critical status |

The Marvarid, Samarqand, and Daryo palettes remain documented in
`src/styles/tokens.css`, together with the dark-mode overlays.

### Geometry

- Small radius: `8px`.
- Default radius: `14px`.
- Large radius: `22px`.
- Extra-large radius: `28px`.
- Desktop navigation rail: `252px`.
- Base spacing followed an 8-point rhythm.

## Layout model

V1 used a persistent left navigation rail, compact top bar, and a fluid main
canvas. At narrower widths, the rail became a modal drawer. Pages used a common
header, KPI strip, cards, tabs, tables, and details pane.

## What V2 intentionally changes

V2 keeps the warm StarForge identity, typography, permission boundary, and
truthful-data rule. Its default shell restores a calmer, theme-adaptive sidebar;
managers can instead choose the full-width top-navigation shell in workspace
preferences. Both layouts share the same authorization and destination model.

The active page system replaces the old horizontal tab decks and persistent
right-side detail panes with stable view selectors, full-width registers, and
focused record dialogs. It also adds stronger information hierarchy,
progressive disclosure, richer decision summaries, restrained motion,
executive language, and reusable notification and loading systems.

V1 should be consulted for brand continuity—not copied back into active
components.
