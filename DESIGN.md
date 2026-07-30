---
name: sopher.ai — The Future Proof
description: A dark, story-first writing world where an author's notebook page becomes a finished book.
colors:
  deep-space: "oklch(0.105 0.017 274)"
  luminous-ink: "oklch(0.95 0.01 270)"
  instrument-graphite: "oklch(0.125 0.022 274)"
  instrument-raised: "oklch(0.18 0.028 274)"
  etched-rule: "oklch(0.255 0.028 274)"
  ultraviolet-core: "oklch(0.56 0.24 289)"
  ion-blue: "oklch(0.72 0.15 251)"
  spectral-violet: "oklch(0.66 0.21 280)"
  night-paper: "oklch(0.94 0.012 88)"
  paper-ink: "oklch(0.19 0.018 78)"
  editorial-amber: "oklch(0.73 0.14 66)"
  success: "oklch(0.69 0.13 153)"
  danger: "oklch(0.62 0.19 25)"
typography:
  display:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "clamp(2.8rem, 7vw, 6rem)"
    fontWeight: 600
    lineHeight: 0.91
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Archivo, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  manuscript:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.09em"
rounded:
  sm: "2px"
  md: "4px"
  lg: "6px"
  xl: "10px"
  status: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
  12: "48px"
  16: "64px"
  24: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ultraviolet-core}"
    textColor: "{colors.luminous-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.deep-space}"
    textColor: "{colors.luminous-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  field:
    backgroundColor: "{colors.instrument-graphite}"
    textColor: "{colors.luminous-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  manuscript-sheet:
    backgroundColor: "{colors.night-paper}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.manuscript}"
    rounded: "{rounded.sm}"
---

<!--
THESIS: “The book in your head, finally on the page.” A familiar dark college-ruled notebook visibly becomes a finished manuscript; the system refuses ambient AI magic, centered SaaS heroes, and interchangeable card grids.
OWN-WORLD: Near-black writing surfaces, one luminous college-ruled notebook, restrained ultraviolet and ion-blue machine light, a quiet margin rule, precise folios, and stacked finished pages.
STORY: Everyday storytellers first recognize their unwritten book, then see the five-stage system turn their direction into pages while preserving author control.
FIRST VIEWPORT: One oversized notebook artifact dominates the composition. An author's plain-language brief enters the page, the page visibly transforms through the five stages, and the final state resolves as a finished manuscript spread; promise and action support the artifact rather than competing with it.
FORM: User-steered “Future Proof,” evolved into a dark college-ruled notebook world. Structural grids and page-level ruling stay invisible; notebook ruling belongs only to the transforming five-stage artifact, never the surrounding canvas or operational workspace. Mobile preserves the same single-artifact story rather than compressing a desktop dashboard.
-->

# Design System: sopher.ai — The Future Proof

## Overview

**Creative North Star: "The Future Proof"**

sopher.ai gives advanced writing technology the confidence of a world-class tool while placing it inside the most familiar place an amateur author begins: a notebook. It is dark-first, exact, and quietly futuristic rather than theatrical or intimidating. The story comes first—an unrealized book becoming visible—while the five-stage system supplies credible proof beneath it.

Persuade surfaces center one dominant dark college-ruled notebook that transforms from brief to outline to prose to finished manuscript. Restrained spectral light marks the machine's work without coloring every stage. Operate surfaces become calmer and denser while keeping the manuscript central. Read surfaces recede around luminous text and use folios as quiet orientation rather than decoration.

**Key Characteristics:**

- The author's book is the subject; the technology is the convincing mechanism.
- One transforming notebook artifact carries the sequence from idea to finished pages.
- College ruling and the margin rule belong only to the transforming page artifact, never page backgrounds or operational product surfaces.
- Light, fine rules, and precise page offsets create depth without neon card chrome.
- Manuscript typography appears only where prose is genuinely being read.
- Color fields own regions; accents are not sprinkled across generic neutral cards.
- Motion belongs to the notebook's transformation, shows editorial progress, and never hides content.

## Colors

The default palette is overwhelmingly near-black, graphite, and luminous neutral. Ultraviolet is the committed brand energy; ion blue appears only where the system is actively working. A light theme remains available as a high-contrast daylight proofing mode, but dark is the branded first impression and the initial theme when no system preference has been expressed.

### Primary

- **Ultraviolet Core:** The action and navigation color. It owns one decisive region on Persuade surfaces and marks the current task on Operate surfaces.

### Secondary

- **Ion Blue:** Live agent activity, streamed generation, and the moving edge of the production sequence. It is never a generic accent.
- **Spectral Violet:** A rare ultraviolet-to-ion transition used only for the signature story sequence, selected manuscript edges, and primary focus moments.

### Tertiary

- **Semantic States:** Success, warning, and danger remain restrained, accessible system colors and never become part of the brand composition.

### Neutral

- **Deep Space:** The primary canvas.
- **Instrument Graphite:** Raised work surfaces and navigation.
- **Luminous Ink:** Primary text and high-energy manuscript highlights.
- **Night Paper:** The manuscript surface; subtly warmer and lighter than the surrounding instrument.
- **Etched Rule:** Borders, college ruling within the notebook artifact, disabled states, and data-table divisions.

**The Spectral Restraint Rule.** Ultraviolet and ion blue appear only where work is active or direction is primary; most of every screen remains neutral.

**The Semantic Separation Rule.** AI, success, money, warning, and danger never share one color role.

## Typography

**Display Font:** Archivo variable (with Arial and system sans-serif fallbacks)

**Body Font:** Archivo variable (with Arial and system sans-serif fallbacks)

**Manuscript Font:** Source Serif 4 variable (with Georgia and serif fallbacks)
**Label/Mono Font:** system monospace

**Character:** Archivo supplies the direct, civic clarity of public wayfinding and scales from oversized statements to dense product controls. Source Serif 4 appears only inside prose, where extended reading—not “bookish atmosphere”—justifies it.

### Hierarchy

- **Display:** Bold, tightly composed, and responsive; used for one decisive statement per Persuade surface.
- **Headline:** Semibold with compact line height; used for route and section orientation.
- **Title:** Semibold at interface scale; used for projects, chapters, and grouped controls.
- **Body:** Regular with generous leading and a maximum reading measure of 68–72 characters.
- **Label:** Medium, concise, and sentence case by default. Uppercase is reserved for true folio marks and short production labels.

**The Prose Boundary Rule.** Serif type never brands generic interface chrome; it begins where manuscript reading begins.

## Layout

The system uses a 12-column desktop structure, a compact tablet structure, and one continuous reading column on phones. The alignment grid is structural, not decorative. Persuade surfaces use uninterrupted deep-space and graphite fields while a single ruled notebook artifact owns the composition and the promise, controls, and proof align around it. Product surfaces privilege the active task, with navigation and inspectors occupying stable edges rather than floating card islands.

Desktop Studio and Admin use a persistent rail. Project navigation groups Plan, Produce, Refine, and Publish. On phones, global navigation moves into an app bar and drawer; editor tools replace global bottom navigation. Horizontal scrolling is allowed only inside explicitly labeled data-table or timeline regions, never at page level.

Spacing follows a 4px base with 8, 12, 16, 24, 32, 48, 64, and 96px steps. Touch targets are at least 44px on mobile.

## Elevation & Depth

The Future Proof is layered like a notebook becoming a book inside a precision writing instrument. Depth comes from the dominant page changing state, stacked manuscript planes, controlled highlights, tonal graphite, and restrained occlusion. Broad bloom, neon outlines, and generic frosted-glass cards are prohibited. Light belongs to the transforming page edge or active process, not every container.

**The Flat-at-Rest Rule.** A resting container is separated by field, rule, or offset; shadow appears only when hierarchy or transient state requires it.

## Shapes

Primary surfaces are square or use small 4–8px corners. Large rounded rectangles do not substitute for composition. Status capsules may be fully rounded because their silhouette communicates a discrete label; buttons, navigation, input fields, and content containers do not become pills.

College-ruled sheets, a quiet margin rule, clipped tabs, page signatures, scanning lines, and offset finished pages are the recurring silhouettes. Icons remain functional and visually subordinate to labels.

## Components

### Buttons

Primary actions use ultraviolet fields with luminous text, compact corners, and decisive 44px minimum mobile height. Secondary actions use etched rules or strong text treatments rather than gray capsules. Pressed state shifts by one instrument step; focus uses a clearly separated ion-blue outline.

### Inputs / Fields

Fields look like precision brief-entry bays: visible labels, etched rules, graphite surfaces, and clear helper/error text. Focus changes both rule weight and spectral edge so it survives forced colors.

### Navigation

Navigation is positional. A current item receives a field or index bar plus semantic `aria-current`, not color alone. Mobile navigation is disclosed through labeled drawers and never hidden without replacement.

### Transforming Notebook

The signature component is one dark college-ruled notebook page that visibly changes from an author's plain-language direction into concept, outline, chapter draft, editorial proof, and a continuity-checked manuscript spread. The artifact remains spatially dominant while stage labels act as supporting evidence. A restrained scan line and luminous page edge show active work. The sequence is keyboard-operable, pausable, fully visible under reduced motion, and remains one coherent artifact on small screens.

### Manuscript Surface

Manuscript surfaces maintain a readable measure, book paragraph rhythm, accessible selection contrast, and enough surrounding quiet to distinguish prose from product chrome.

## Do's and Don'ts

### Do:

- **Do** make the current stage, state, and next action obvious before adding expression.
- **Do** use deep writing fields, one dominant ruled notebook, restrained stage telemetry, luminous page planes, and precise offsets as the identity.
- **Do** lead with the story-first promise, then use the five-stage system as proof.
- **Do** preserve semantic HTML, server-rendered public content, and familiar control behavior.
- **Do** adapt the same world into persuasive, operational, and reading densities.
- **Do** keep authored sample content clearly labeled.

### Don't:

- **Don't** use auroras, gradient text, generic glass cards, neon outlines on every surface, generic icon tiles, or stock AI imagery.
- **Don't** use ruled or gridded page backgrounds; the line motif belongs only inside the five-stage notebook artifact.
- **Don't** use a centered headline-plus-two-buttons hero as the first viewport.
- **Don't** use two-axis grid texture, or carry notebook ruling into operational product surfaces.
- **Don't** give every stage an equally dominant visual container; the transforming notebook is the hero artifact.
- **Don't** repeat the same rounded card grid for unrelated tasks.
- **Don't** use decorative serif typography outside real prose.
- **Don't** hide navigation on mobile without an accessible replacement.
- **Don't** invent testimonials, customers, benchmarks, metrics, or publishing outcomes.
