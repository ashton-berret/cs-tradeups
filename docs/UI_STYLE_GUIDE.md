# UI Style Guide

A comprehensive guide to the UI design decisions, color system, component patterns, and styling conventions used in this project. Use this as a reference for building consistent interfaces in related projects.

**Last Updated:** 2026-04-23

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [CSS Variables](#css-variables)
4. [Typography](#typography)
5. [Component Library](#component-library)
6. [Layout Patterns](#layout-patterns)
7. [Feature Patterns](#feature-patterns)
8. [Chart Theming](#chart-theming)
9. [Utility Classes](#utility-classes)
10. [Icon System](#icon-system)
11. [Accessibility](#accessibility)

---

## Design Philosophy

### Core Principles

- **Dark-first design**: Dark mode is the default, with light mode as an alternative
- **Neon accents**: Primary interactions use vibrant, glowing colors for emphasis
- **Subtle depth**: Cards and surfaces use slight elevation changes rather than heavy shadows
- **Smooth transitions**: 0.2s ease transitions for theme switching and interactive states
- **Minimal, functional**: Focus on clarity and usability over decorative elements

### Visual Language

- GSAP/cyberpunk-inspired dark theme with neon green accents
- Clean, modern light theme with blue accents
- Consistent border-radius (typically `rounded-lg` or `rounded-md`)
- Subtle borders instead of heavy shadows for depth

---

## Color System

### Dark Theme (Default)

| Token | Hex Value | Usage |
|-------|-----------|-------|
| `bg.base` | `#0E100F` | Page background |
| `bg.surface` | `#161818` | Sidebar, elevated areas |
| `bg.surfaceElevated` | `#1E2020` | Cards, modals |
| `bg.surfaceOverlay` | `#262828` | Hover states, inputs |
| `primary.DEFAULT` | `#0AE448` | Neon green - primary actions, active states |
| `primary.hover` | `#08C73D` | Primary button hover |
| `primary.glow` | `rgba(10, 228, 72, 0.4)` | Glow effects |
| `secondary` | `#00D4FF` | Cyan - secondary accent |
| `success` | `#0AE448` | Success states (same as primary) |
| `warning` | `#FFB800` | Warning states |
| `danger` | `#FF4757` | Error/danger states |
| `text.primary` | `#F5F5F5` | Main text |
| `text.secondary` | `#A3A3A3` | Secondary text, labels |
| `text.muted` | `#6B6B6B` | Placeholder text, hints |
| `border.DEFAULT` | `#2D2D2D` | Borders, dividers |
| `border.hover` | `#3D3D3D` | Border hover state |

### Light Theme

| Token | Hex Value | Usage |
|-------|-----------|-------|
| `bg.base` | `#F3F4F6` | Page background |
| `bg.surface` | `#FFFFFF` | Sidebar, elevated areas |
| `bg.surfaceElevated` | `#FFFFFF` | Cards, modals |
| `bg.surfaceOverlay` | `#F9FAFB` | Hover states, inputs |
| `primary.DEFAULT` | `#2563EB` | Blue - primary actions |
| `primary.hover` | `#1D4ED8` | Primary button hover |
| `primary.glow` | `rgba(37, 99, 235, 0.3)` | Glow effects |
| `secondary` | `#3B82F6` | Secondary accent |
| `success` | `#10B981` | Success states |
| `warning` | `#F59E0B` | Warning states |
| `danger` | `#EF4444` | Error/danger states |
| `text.primary` | `#111827` | Main text |
| `text.secondary` | `#6B7280` | Secondary text, labels |
| `text.muted` | `#9CA3AF` | Placeholder text, hints |
| `border.DEFAULT` | `#E5E7EB` | Borders, dividers |
| `border.hover` | `#D1D5DB` | Border hover state |

### Rarity Colors (Consistent Across Themes)

These colors match CS2's in-game rarity tiers and are used for rarity identification throughout the UI. Exported as `RARITY_COLORS` from `$lib/types/enums`:

| Rarity | Hex | Usage |
|--------|-----|-------|
| Consumer Grade | `#B0C3D9` | White-tier rarity |
| Industrial Grade | `#5E98D9` | Light blue-tier rarity |
| Mil-Spec | `#4B69FF` | Blue-tier rarity |
| Restricted | `#8847FF` | Purple-tier rarity |
| Classified | `#D32CE6` | Pink-tier rarity |
| Covert | `#EB4B4B` | Red-tier rarity |

**Rarity Dot** (`$lib/components/RarityDot.svelte`) — inline glowing dot for dense contexts (table rows, compact listings):

```html
<span
    class="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/20"
    style:background-color={RARITY_COLORS[rarity]}
    style:box-shadow={`0 0 6px ${RARITY_COLORS[rarity]}66`}
></span>
```

**Rarity Pill** — label + dot with color-matched border/background for headers and rarity flow indicators:

```html
<span
    class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium"
    style:color={color}
    style:border-color={`${color}55`}
    style:background-color={`${color}15`}
>
    <span class="h-1.5 w-1.5 rounded-full" style:background-color={color}></span>
    {label}
</span>
```

### Chart Color Palettes

**Dark Mode Palette:**
```javascript
['#0AE448', '#00D4FF', '#FFB800', '#FF4757', '#8B5CF6', '#EC4899']
```

**Light Mode Palette:**
```javascript
['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
```

---

## CSS Variables

All theme colors are exposed as CSS custom properties for easy access in styles:

```css
:root {
    /* Backgrounds */
    --color-bg-base: #0E100F;
    --color-bg-surface: #161818;
    --color-bg-surface-elevated: #1E2020;
    --color-bg-surface-overlay: #262828;

    /* Primary */
    --color-primary: #0AE448;
    --color-primary-hover: #08C73D;
    --color-primary-glow: rgba(10, 228, 72, 0.4);

    /* Secondary & Semantic */
    --color-secondary: #00D4FF;
    --color-success: #0AE448;
    --color-warning: #FFB800;
    --color-danger: #FF4757;

    /* Text */
    --color-text-primary: #F5F5F5;
    --color-text-secondary: #A3A3A3;
    --color-text-muted: #6B6B6B;

    /* Borders */
    --color-border: #2D2D2D;
    --color-border-hover: #3D3D3D;
}

/* Light mode overrides - applied via .light class on <html> */
.light {
    --color-bg-base: #F3F4F6;
    --color-bg-surface: #FFFFFF;
    --color-bg-surface-elevated: #FFFFFF;
    --color-bg-surface-overlay: #F9FAFB;
    --color-primary: #2563EB;
    --color-primary-hover: #1D4ED8;
    --color-primary-glow: rgba(37, 99, 235, 0.3);
    --color-secondary: #3B82F6;
    --color-success: #10B981;
    --color-warning: #F59E0B;
    --color-danger: #EF4444;
    --color-text-primary: #111827;
    --color-text-secondary: #6B7280;
    --color-text-muted: #9CA3AF;
    --color-border: #E5E7EB;
    --color-border-hover: #D1D5DB;
}
```

### Using CSS Variables

```html
<!-- In Tailwind classes -->
<div class="bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border-[var(--color-border)]">
    Content
</div>

<!-- In style blocks -->
<style>
.custom-element {
    background-color: var(--color-bg-surface-elevated);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
}
</style>
```

---

## Typography

### Font Stack

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

### Size Scale (Tailwind)

| Class | Size | Usage |
|-------|------|-------|
| `text-[10px]` | 10px | Micro-labels on stat blocks, section eyebrows, table headers |
| `text-xs` | 12px | Labels, hints, badges |
| `text-sm` | 14px | Body text, inputs, buttons |
| `text-base` | 16px | Large buttons, emphasis |
| `text-lg` | 18px | Card titles, modal titles |
| `text-xl` | 20px | Section headers |
| `text-2xl` | 24px | Page titles |
| `text-3xl` | 30px | Large metrics, hero numbers |

### Micro-label

Used above any stat value, KPI, or sub-section header. Uppercase + tracking-wider + muted gives a quiet "category tag" look that keeps stat triads readable without competing with the value.

```html
<div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
    Cost
</div>
<div class="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
    $12.40
</div>
```

Numeric values should always use `tabular-nums` for stable column widths.

### Font Weights

| Class | Weight | Usage |
|-------|--------|-------|
| `font-normal` | 400 | Body text |
| `font-medium` | 500 | Labels, buttons, navigation |
| `font-semibold` | 600 | Headings, emphasis |
| `font-bold` | 700 | Strong emphasis (sparingly) |

### Text Colors

```html
<!-- Primary text - main content -->
<p class="text-[var(--color-text-primary)]">Main content</p>

<!-- Secondary text - labels, descriptions -->
<p class="text-[var(--color-text-secondary)]">Label or description</p>

<!-- Muted text - placeholders, hints -->
<p class="text-[var(--color-text-muted)]">Hint text</p>

<!-- Semantic colors -->
<p class="text-[var(--color-success)]">Success message</p>
<p class="text-[var(--color-warning)]">Warning message</p>
<p class="text-[var(--color-danger)]">Error message</p>
```

---

## Component Library

### Button

**Variants:**

| Variant | Description | Dark Mode | Light Mode |
|---------|-------------|-----------|------------|
| `primary` | Main actions | Neon green bg, dark text, glow on hover | Blue bg, white text |
| `secondary` | Secondary actions | Surface bg, bordered, subtle hover | White bg, bordered |
| `danger` | Destructive actions | Red bg, white text | Red bg, white text |
| `ghost` | Tertiary actions | Transparent, text only | Transparent, text only |

**Sizes:**

| Size | Padding | Font |
|------|---------|------|
| `sm` | `px-3 py-1.5` | `text-sm` |
| `md` | `px-4 py-2` | `text-sm` |
| `lg` | `px-6 py-3` | `text-base` |

**Base Classes:**
```
inline-flex items-center justify-center font-medium rounded-lg transition-colors
focus:outline-none focus:ring-2 focus:ring-offset-2
disabled:opacity-50 disabled:cursor-not-allowed
```

**Primary Button Example:**
```html
<button class="
    inline-flex items-center justify-center font-medium rounded-lg
    bg-[var(--color-primary)] text-[#0E100F]
    hover:bg-[var(--color-primary-hover)]
    focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]
    btn-glow px-4 py-2 text-sm
">
    Primary Action
</button>
```

### Card

**Props:**
- `padding`: `none` | `sm` (p-4) | `md` (p-6) | `lg` (p-8)
- `glow`: boolean - enables neon glow on hover

**Base Classes:**
```
bg-[var(--color-bg-surface-elevated)]
rounded-xl shadow-sm
border border-[var(--color-border)]
transition-all duration-200
```

`rounded-xl` is the default radius for all cards to keep the app visually consistent with feature cards (PlanCard, BasketCard, KPI tiles). Legacy `rounded-lg` is reserved for sub-elements inside a card (nested stat panels, editor forms).

**Card with Glow:**
```html
<div class="
    bg-[var(--color-bg-surface-elevated)]
    rounded-xl shadow-sm
    border border-[var(--color-border)]
    card-glow
    p-6
">
    Card content
</div>
```

**Hover-elevate pattern** (used for feature cards that respond to interaction):

```html
<div class="
    group relative overflow-hidden rounded-xl border
    border-[var(--color-border)]
    bg-[var(--color-bg-surface-elevated)]
    shadow-sm transition-all duration-200
    hover:border-[var(--color-border-hover)]
    hover:shadow-[0_8px_20px_-12px_rgba(0,0,0,0.5)]
">
    ...
</div>
```

### Input

**Base Classes:**
```
w-full rounded-md border px-4 py-2 text-sm transition-colors
focus:outline-none focus:ring-2 focus:ring-offset-0
bg-[var(--color-bg-surface-overlay)]
text-[var(--color-text-primary)]
placeholder:text-[var(--color-text-muted)]
border-[var(--color-border)]
focus:border-[var(--color-primary)]
focus:ring-[var(--color-primary)]/20
```

**Error State:**
```
border-[var(--color-danger)]
focus:border-[var(--color-danger)]
focus:ring-[var(--color-danger)]/20
```

**Label Style:**
```
mb-2 block text-sm font-medium text-[var(--color-text-secondary)]
```

### Select

Uses identical styling to Input for consistency.

### Modal

**Backdrop:**
```
fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4
```

**Content Container:**
```
w-full max-w-lg rounded-lg
bg-[var(--color-bg-surface-elevated)]
border border-[var(--color-border)]
shadow-xl
```

**Header:**
```
flex items-center justify-between
border-b border-[var(--color-border)]
px-6 py-4
```

**Body:**
```
p-6
```

**Footer:**
```
flex justify-end gap-3
border-t border-[var(--color-border)]
px-6 py-4
```

### DataTable

`$lib/components/DataTable.svelte` — shared paginated-row container. Wraps its children in a `Card` (`padding="none"`) and renders a `<table>`. Use it for flat tabular data; for feature cards (plans, baskets), render a direct grid/list of the feature card component instead and skip DataTable.

**Header:**
```
border-b border-[var(--color-border)]
bg-[var(--color-bg-surface)]/60
text-[10px] font-semibold uppercase tracking-wider
text-[var(--color-text-muted)]
```

**Row dividers and hover:**
```
divide-y divide-[var(--color-border)]/60
hover: bg-[var(--color-bg-surface-overlay)]/40
transition-colors
```

The `/60` and `/40` alpha suffixes soften dividers and hover against the elevated card surface.

### Toggle Switch

```css
.toggle-switch {
    position: relative;
    width: 48px;
    height: 24px;
    background-color: var(--color-border);
    border-radius: 12px;
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.toggle-switch.active {
    background-color: var(--color-primary);
}

.toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background-color: var(--color-text-primary);
    border-radius: 50%;
    transition: transform 0.2s ease;
}

.toggle-switch.active::after {
    transform: translateX(24px);
    background-color: #0E100F;
}
```

---

## Layout Patterns

### Sidebar Navigation

**Container:**
```
fixed left-0 top-0 z-40 h-screen w-64
border-r border-[var(--color-border)]
bg-[var(--color-bg-surface)]
```

**Logo Section:**
```
flex h-16 items-center border-b border-[var(--color-border)] px-6
```

**Navigation Items:**
```html
<!-- Inactive -->
<a class="
    flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
    text-[var(--color-text-secondary)]
    hover:bg-[var(--color-bg-surface-overlay)]
    hover:text-[var(--color-text-primary)]
">

<!-- Active -->
<a class="
    flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
    bg-[var(--color-primary)]/10
    text-[var(--color-primary)]
    shadow-[0_0_10px_var(--color-primary-glow)]
">
```

### Main Content Area

```
ml-64 min-h-screen bg-[var(--color-bg-base)]
```

### Page Header

```html
<div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-semibold text-[var(--color-text-primary)]">Page Title</h1>
    <div class="flex items-center gap-3">
        <!-- Actions -->
    </div>
</div>
```

### Grid Layouts

```html
<!-- Two-column card grid -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

<!-- Four-column metric grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

<!-- Three-column settings grid -->
<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
```

---

## Feature Patterns

Higher-level compositions that appear across multiple pages. Keep these visually consistent — they define the app's character.

### Accent Stripe

A 1-wide vertical gradient bar flush to a card's left edge. Signals "this card has a dominant property" (a rarity flow, a status axis, a brand accent). Always paired with a card that sets `overflow-hidden`.

```html
<div class="relative overflow-hidden rounded-xl border ...">
    <div
        class="pointer-events-none absolute left-0 top-0 h-full w-1"
        style:background={`linear-gradient(180deg, ${inputColor} 0%, ${targetColor} 100%)`}
    ></div>
    ...
</div>
```

For KPI tiles without a domain-specific gradient, use the brand gradient:
```
bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-secondary)] opacity-60
hover: opacity-100
```

### Stat Triad

Three numeric cells separated by 1px hairline dividers. Use it any time a feature card has 2–4 headline metrics (cost / EV / target, cost / EV / float, etc.). Each cell pairs a micro-label with a tabular-nums value; color the value semantically where relevant (`--color-success`, `--color-danger`, `--color-secondary`, or primary text).

```html
<div class="flex items-center gap-4 text-right tabular-nums">
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cost</div>
        <div class="text-sm font-semibold text-[var(--color-text-primary)]">$12.40</div>
    </div>
    <div class="h-8 w-px bg-[var(--color-border)]"></div>
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">EV</div>
        <div class="text-sm font-semibold text-[var(--color-secondary)]">$18.20</div>
    </div>
    <div class="h-8 w-px bg-[var(--color-border)]"></div>
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Target</div>
        <div class="text-sm font-semibold text-[var(--color-success)]">≥ 30%</div>
    </div>
</div>
```

When laid out inside a sub-panel (instead of inline in a header), wrap the triad in its own bordered surface and separate cells with `border-l` instead of a sized hairline:

```html
<div class="grid grid-cols-3 gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)]/40 p-3">
    <div> ...stat 1... </div>
    <div class="border-l border-[var(--color-border)] pl-3"> ...stat 2... </div>
    <div class="border-l border-[var(--color-border)] pl-3"> ...stat 3... </div>
</div>
```

### KPI Tile

Dashboard headline metric. Left-edge brand gradient stripe + micro-label + large tabular value + help text.

```html
<div class="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface-elevated)] p-5 shadow-sm transition-all duration-200 hover:border-[var(--color-border-hover)] hover:shadow-[0_8px_20px_-12px_rgba(0,0,0,0.5)]">
    <div class="pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-secondary)] opacity-60 transition-opacity group-hover:opacity-100"></div>
    <div class="pl-2">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Candidates this week</div>
        <div class="mt-2 text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">42</div>
        <div class="mt-1 text-xs text-[var(--color-text-muted)]">Helper text</div>
    </div>
</div>
```

### Collapsible Feature Card

A dense-list card that shows a single summary row by default and reveals detail sections when expanded. Used for PlanCard; applicable to any entity with a long edit form but short at-a-glance summary.

Structure:
- Outer: hover-elevate card with `overflow-hidden`.
- Optional accent stripe on the left edge.
- Full-width `<button type="button">` header containing a chevron (rotates `90°` and tints primary when open), name + status badges, any domain summary (rarity pills, collection chips), and a stat triad on the right.
- When expanded: `border-t` divider, then alternating-background sections. Section headers use micro-labels. A **Danger zone** footer (red-tinted bar) can hold the delete action.

```html
<div class="group relative overflow-hidden rounded-xl border ...">
    <div class="absolute left-0 top-0 h-full w-1" style:background={gradient}></div>

    <button type="button" class="flex w-full items-center gap-5 py-4 pl-6 pr-5 text-left transition-colors hover:bg-[var(--color-bg-surface-overlay)]/30">
        <span class={`flex h-7 w-7 items-center justify-center rounded-md border transition-all ${expanded ? 'rotate-90 border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : '...'}`}>
            <!-- chevron svg -->
        </span>
        <!-- name, badges, pills, stat triad -->
    </button>

    {#if expanded}
        <div class="border-t border-[var(--color-border)]">
            <section class="bg-[var(--color-bg-surface)]/40 p-6">...</section>
            <section class="p-6">...</section>
            <section class="border-t border-[var(--color-border)] bg-[var(--color-bg-surface)]/40 p-6">...</section>
            <div class="flex items-center justify-between border-t border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5 px-6 py-4">
                <!-- danger zone -->
            </div>
        </div>
    {/if}
</div>
```

### Gradient Progress Bar

Used for slot fill, capacity, or completion meters. Thin track over surface-overlay, filled with the brand gradient.

```html
<div class="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-surface-overlay)]">
    <div
        class="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] transition-all"
        style:width={`${pct}%`}
    ></div>
</div>
```

### Danger Zone Footer

For destructive actions on feature cards, tuck them into a distinct red-tinted footer strip instead of placing them inline. Establishes a clear safety perimeter.

```html
<div class="flex items-center justify-between border-t border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5 px-6 py-4">
    <div>
        <div class="text-xs font-semibold uppercase tracking-wider text-[var(--color-danger)]">Danger zone</div>
        <p class="text-xs text-[var(--color-text-muted)]">Reason deletion may be blocked.</p>
    </div>
    <Button variant="danger" size="sm">Delete</Button>
</div>
```

---

## Chart Theming

### ECharts Configuration

```typescript
function getChartTheme(mode: 'dark' | 'light') {
    const isDark = mode === 'dark';

    return {
        backgroundColor: 'transparent',
        textStyle: {
            color: isDark ? '#A3A3A3' : '#6B7280',
        },
        title: {
            textStyle: {
                color: isDark ? '#F5F5F5' : '#111827',
            },
        },
        legend: {
            textStyle: {
                color: isDark ? '#A3A3A3' : '#6B7280',
            },
        },
        tooltip: {
            backgroundColor: isDark ? '#1E2020' : '#FFFFFF',
            borderColor: isDark ? '#2D2D2D' : '#E5E7EB',
            textStyle: {
                color: isDark ? '#F5F5F5' : '#111827',
            },
        },
        xAxis: {
            axisLine: { lineStyle: { color: isDark ? '#2D2D2D' : '#E5E7EB' } },
            axisLabel: { color: isDark ? '#A3A3A3' : '#6B7280' },
            splitLine: { lineStyle: { color: isDark ? '#2D2D2D' : '#F3F4F6' } },
        },
        yAxis: {
            axisLine: { lineStyle: { color: isDark ? '#2D2D2D' : '#E5E7EB' } },
            axisLabel: { color: isDark ? '#A3A3A3' : '#6B7280' },
            splitLine: { lineStyle: { color: isDark ? '#2D2D2D' : '#F3F4F6' } },
        },
        color: isDark
            ? ['#0AE448', '#00D4FF', '#FFB800', '#FF4757', '#8B5CF6', '#EC4899']
            : ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
    };
}
```

### Chart Card Pattern

```html
<div class="bg-[var(--color-bg-surface-elevated)] rounded-lg border border-[var(--color-border)] p-6">
    <h3 class="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Chart Title</h3>
    <div class="h-64">
        <!-- Chart container -->
    </div>
</div>
```

---

## Utility Classes

### Glow Effects

**Card Glow (on hover):**
```css
.card-glow {
    transition: box-shadow 0.3s ease, border-color 0.3s ease;
}

.card-glow:hover {
    box-shadow:
        0 0 20px var(--color-primary-glow),
        0 0 40px var(--color-primary-glow);
    border-color: var(--color-primary);
}
```

**Button Glow (on hover):**
```css
.btn-glow {
    transition: box-shadow 0.3s ease;
}

.btn-glow:hover:not(:disabled) {
    box-shadow:
        0 0 15px var(--color-primary-glow),
        0 0 30px var(--color-primary-glow);
}
```

### Theme Transitions

```css
html {
    transition: background-color 0.2s ease, color 0.2s ease;
}

body {
    transition: background-color 0.2s ease, color 0.2s ease;
}
```

### Common Patterns

**Hover Background:**
```
hover:bg-[var(--color-bg-surface-overlay)]
```

**Border with Hover:**
```
border border-[var(--color-border)] hover:border-[var(--color-border-hover)]
```

**Focus Ring:**
```
focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2
```

---

## Icon System

Icons use inline SVGs with consistent sizing and stroke styling:

```html
<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="..." />
</svg>
```

### Common Icon Sizes

| Size | Classes | Usage |
|------|---------|-------|
| Small | `h-4 w-4` | Inline with text, badges |
| Default | `h-5 w-5` | Navigation, buttons |
| Medium | `h-6 w-6` | Card icons, emphasis |
| Large | `h-8 w-8` | Feature icons, empty states |

### Icon Colors

Icons inherit text color via `currentColor`:

```html
<!-- Uses text color -->
<svg class="h-5 w-5 text-[var(--color-text-secondary)]" ...>

<!-- Primary color -->
<svg class="h-5 w-5 text-[var(--color-primary)]" ...>
```

---

## Accessibility

### Focus States

All interactive elements have visible focus indicators:

```
focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2
```

### Color Contrast

- All text meets WCAG AA contrast requirements
- Category colors are colorblind-friendly (tested with common forms of color blindness)

### Keyboard Navigation

- Modals trap focus and close on Escape
- Tab order follows visual layout
- Interactive elements are keyboard accessible

### ARIA Attributes

```html
<!-- Modal -->
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">

<!-- Close button -->
<button aria-label="Close modal">
```

---

## Theme Implementation

### Flash Prevention Script

Add this script in `<head>` before other scripts to prevent flash of wrong theme:

```html
<script>
    (function() {
        const theme = localStorage.getItem('cs-tradeups-theme');
        if (theme === 'light') {
            document.documentElement.classList.add('light');
        }
    })();
</script>
```

### Theme Store (Svelte)

```typescript
import { writable } from 'svelte/store';

type Theme = 'dark' | 'light';

function createThemeStore() {
    const { subscribe, set, update } = writable<Theme>('dark');

    return {
        subscribe,
        initialize: () => {
            if (typeof window !== 'undefined') {
                const stored = localStorage.getItem('cs-tradeups-theme') as Theme | null;
                const theme = stored || 'dark';
                set(theme);
                document.documentElement.classList.toggle('light', theme === 'light');
            }
        },
        toggle: () => {
            update(current => {
                const next = current === 'dark' ? 'light' : 'dark';
                localStorage.setItem('cs-tradeups-theme', next);
                document.documentElement.classList.toggle('light', next === 'light');
                return next;
            });
        },
        setTheme: (theme: Theme) => {
            localStorage.setItem('cs-tradeups-theme', theme);
            document.documentElement.classList.toggle('light', theme === 'light');
            set(theme);
        }
    };
}

export const theme = createThemeStore();
```

---

## Quick Reference

### Common Element Styles

| Element | Classes |
|---------|---------|
| Page background | `bg-[var(--color-bg-base)]` |
| Card background | `bg-[var(--color-bg-surface-elevated)]` |
| Input background | `bg-[var(--color-bg-surface-overlay)]` |
| Primary text | `text-[var(--color-text-primary)]` |
| Secondary text | `text-[var(--color-text-secondary)]` |
| Micro-label | `text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]` |
| Numeric value | `tabular-nums` |
| Border | `border border-[var(--color-border)]` |
| Primary button | `bg-[var(--color-primary)] text-[#0E100F] btn-glow` |
| Rarity color | `RARITY_COLORS[rarity]` from `$lib/types/enums` |
| Success text | `text-[var(--color-success)]` |
| Warning text | `text-[var(--color-warning)]` |
| Danger text | `text-[var(--color-danger)]` |

### Spacing Scale

Follow Tailwind's default spacing scale:
- `gap-1` / `p-1` = 4px
- `gap-2` / `p-2` = 8px
- `gap-3` / `p-3` = 12px
- `gap-4` / `p-4` = 16px
- `gap-6` / `p-6` = 24px
- `gap-8` / `p-8` = 32px

### Border Radius

- `rounded-md` - Inputs, small elements, nested panels
- `rounded-lg` - Buttons, modals, sub-surfaces inside a card
- `rounded-xl` - Top-level cards and feature cards (PlanCard, BasketCard, KPI tiles)
- `rounded-full` - Avatars, badges, dots, toggle knobs, progress bars

---

## Tech Stack Reference

- **CSS Framework:** TailwindCSS 4.x
- **Component Framework:** Svelte 5 (runes syntax)
- **Chart Library:** ECharts
- **Icons:** Inline SVGs (Heroicons style)
- **Theme Storage:** localStorage (`cs-tradeups-theme` key)


