# AgSKAN UI Style Guide

This document defines the UI standards for each area of the application. Each area intentionally has its own visual identity, but within each area the style must be **consistent**.

---

## Sections

| Area | Path | Style Family |
|---|---|---|
| **Account website** | `/src/routes/(admin)/account/` | DaisyUI adaptive (light/dark) |
| **Map viewer** | `/src/lib/components/map/` | Custom dark glassmorphic |
| **Marketing pages** | `/src/routes/(marketing)/` | DaisyUI light + brand colors |

---

## 1. Account Website

The account area uses DaisyUI semantic colour variables so it automatically adapts to light and dark themes.

### Modals

All modals follow a strict **sandwich layout**: header → body → footer. No exceptions.

```
Overlay:   fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4
Box:       w-full max-w-sm rounded-2xl bg-base-100 shadow-2xl overflow-hidden
Header:    flex items-center justify-between border-b border-base-300 px-5 py-4
Body:      border-t border-base-300 px-5 py-4
Footer:    flex justify-end px-5 py-3
```

Header interior structure:
```svelte
<div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
  <div class="flex items-center gap-3">
    <!-- icon in circle — REQUIRED, must be contextually relevant -->
    <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-base-content/10">
      <Icon icon="..." width="18" height="18" class="text-base-content" />
    </div>
    <h4 class="text-base font-semibold text-contrast-content">Title</h4>
  </div>
  <!-- X close button -->
  <button class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-base-200">
    <X class="h-4 w-4 text-contrast-content/60" />
  </button>
</div>
```

> **Icon is required** in every modal header. Choose an icon that reflects the modal's purpose (e.g. `solar:user-bold-duotone` for name, `solar:letter-bold-duotone` for email, `solar:lock-password-bold-duotone` for password, `solar:trash-bin-trash-bold-duotone` for delete).
> For Lucide-based action icons (X, Pencil) use `lucide-svelte`. For content icons use `@iconify/svelte` Solar Duotone.

Footer buttons:
- **Save / primary action**: `rounded-lg bg-base-content px-4 py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:opacity-50`
- **Destructive action**: `btn btn-error gap-2`
- No Cancel button — use X close or click-away instead
- Button shows `"Saving..."` while saving; disable during async ops

Closing behaviour: click outside backdrop OR press Escape. Never require explicit Cancel.

### Editable Field Cards

Clickable cards that open a modal on click:
```
flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4
transition-colors hover:border-base-content/20
```

Layout inside: icon on left → label + value in middle → pen icon on right.

```svelte
<button type="button" on:click={openModal} class="flex w-full items-center gap-3 ...">
  <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
    <Icon icon="..." width="18" height="18" class="text-base-content" />
  </div>
  <div class="flex-1 min-w-0">
    <label class="block text-sm text-contrast-content/60">Field Label</label>
    <p class="font-medium text-contrast-content">Current value</p>
  </div>
  <div class="flex-shrink-0 text-contrast-content/40">
    <Icon icon="solar:pen-bold-duotone" width="18" height="18" />
  </div>
</button>
```

Read-only info cards (no pen icon, no hover):
```
rounded-lg border border-base-300 bg-base-200/30 p-4
```

### Form Inputs

```
rounded-lg border border-base-300 bg-base-100 px-4 py-3
text-contrast-content placeholder-contrast-content/50
focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
```

Error state: replace `border-base-300` with `border-error`.

Labels: `mb-1 block text-sm font-medium text-contrast-content`

Error messages: `mt-1 flex items-center gap-1 text-sm text-error`

### Page Headers

```
flex items-center justify-between border-b border-base-300 bg-base-100 p-5
```

Title:
```svelte
<h2 class="flex items-center gap-2 text-xl font-semibold text-contrast-content">
  <div class="rounded-lg bg-base-content/10 p-1.5">
    <Icon icon="..." width="18" height="18" class="text-base-content" />
  </div>
  Page Title
</h2>
```

### Settings Content Layout

```
space-y-4 p-6
```

Settings row cards all use the same editable card format above.

Toggle settings (boolean):
```svelte
<div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-start gap-3">
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon ... />
      </div>
      <div>
        <p class="text-sm font-medium text-contrast-content">Label</p>
        <p class="text-xs text-contrast-content/60">Description</p>
      </div>
    </div>
    <input type="checkbox" class="toggle toggle-primary" ... />
  </div>
</div>
```

### Typography

| Role | Classes |
|---|---|
| Page title | `text-xl font-semibold text-contrast-content` |
| Section heading | `text-base font-semibold text-contrast-content` |
| Card label | `text-sm text-contrast-content/60` |
| Card value | `font-medium text-contrast-content` |
| Helper text | `text-xs text-contrast-content/60` |
| Success badge | `text-xs text-success` |
| Error text | `text-sm text-error` |

### Colours

Use DaisyUI variables only — never hardcoded hex in account pages.

| Token | Usage |
|---|---|
| `bg-base-100` | Page/card background |
| `bg-base-200/30` | Card fill (subtle) |
| `bg-base-300` | Dividers, borders |
| `bg-base-content/10` | Icon container fill |
| `text-contrast-content` | Primary text |
| `text-contrast-content/60` | Secondary text |
| `text-contrast-content/40` | Tertiary / icon |
| `bg-base-content` | Primary save button bg |
| `text-base-100` | Primary save button text |

---

## 2. Map Viewer

The map viewer uses **custom CSS only** (no DaisyUI/Tailwind classes in modal/panel components) with a fixed dark glassmorphic style. This is intentional — the UI overlays a dark map and must never adapt to light mode.

### Modals

```css
/* Overlay */
.modal-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  animation: fadeIn 0.2s ease-out;
}

/* Box */
.trail-modal {
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  max-width: 420px;
  width: 90%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  animation: slideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  overflow: hidden;
}

/* Header */
.trail-modal-header {
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
```

Header colour variants:
- `.recording` — green gradient: `rgba(34, 197, 94, 0.15)`
- `.stopped` — grey gradient: `rgba(107, 114, 128, 0.15)`
- `.danger` — red gradient: `rgba(239, 68, 68, 0.15)`

Text colours (hardcoded):
- Primary: `rgba(255, 255, 255, 0.95)` / `text-white`
- Secondary: `rgba(255, 255, 255, 0.7)` / `text-white/70`
- Labels: `rgba(255, 255, 255, 0.5)` (uppercase, `font-size: 10px`)

Buttons:
```css
/* Primary action */
background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
color: white;
padding: 11px 18px;
border-radius: 10px;
font-weight: 600;
font-size: 13px;

/* Secondary */
background: rgba(255, 255, 255, 0.1);
border: 1px solid rgba(255, 255, 255, 0.2);

/* Danger */
background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
```

Close button: `h-8 w-8 rounded-full hover:bg-white/10`

### Stat / Info Cards

```css
background: rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 10px;
padding: 10px;
```

Variants:
- Warning: `rgba(251, 191, 36, 0.1)` background, `rgba(251, 191, 36, 0.2)` border
- Info (blue): `rgba(96, 165, 250, 0.1)` background
- Purple (time): `rgba(168, 85, 247, 0.15)` background

### Toolbox Buttons

Compact icon-button style, dark fill, adapts to the map overlay. No DaisyUI classes.

---

## 3. Marketing Pages

Marketing pages use DaisyUI with the `skantheme` light theme and brand-specific colours. These pages are always light — no dark mode toggle.

### Brand Colours

| Token | Value | Usage |
|---|---|---|
| `primary` | `#17a34a` (green) | CTAs, highlights |
| `secondary` | `#F7DB5C` (yellow) | Accents, badges |
| `accent` | `#D95D39` (orange) | Tertiary |
| `brand-content` | yellow | Hero CTA background |

### CTAs / Buttons

```
Primary: rounded-lg bg-brand-content px-6 py-4 shadow-lg hover:scale-105 hover:shadow-xl
Secondary: rounded-lg border border-base-300 bg-base-100 px-6 py-4 hover:bg-base-200
Pricing: bg-secondary px-4 py-3.5 text-lg font-medium text-secondary-content shadow-secondary/30
```

### Cards

```
Feature:  rounded-lg bg-base-200 p-6 hover:bg-primary hover:text-primary-content
Pricing:  rounded-xl border border-base-300 bg-base-100 p-6 shadow-xl
Highlight: border-2 border-secondary/40 bg-secondary/5
```

### Layout

```
Container: .section-container (max-width responsive wrapper)
Section spacing: py-12 md:py-16 or py-20 sm:py-32
Grids: grid gap-6 sm:grid-cols-2 or lg:grid-cols-3
Hero: grid items-center gap-8 lg:grid-cols-2
```

### Typography

| Role | Classes |
|---|---|
| H1 | `text-3xl font-bold leading-tight md:text-4xl lg:text-5xl` |
| H2 | `text-2xl font-bold text-base-content` |
| Body | `text-lg text-contrast-content/80` |
| Small | `text-sm` |

Font families (global): Montserrat (headings), Inter (body).

---

## Cross-Area Rules

These apply everywhere:

1. **Never hardcode hex colours in account or marketing pages.** Use DaisyUI tokens.
2. **Never use DaisyUI utility classes in map components.** Use custom CSS.
3. **No `Cancel` button in modals.** Use X close + click-away + Escape.
4. **Saving state on all async buttons.** Button text → `"Saving..."`, `disabled` during async.
5. **Error messages appear inline** under the input — never as a separate toast for validation.
6. **Success toasts are brief and specific**: "Full Name updated", not "Saved successfully!".
7. **Icons**: Solar Duotone set via `@iconify/svelte` in account/marketing. Lucide icons for action icons (X, Pencil) in account modals.
8. **Responsive**: Account pages use `md:` / `lg:` breakpoints. Marketing uses `sm:` / `md:` / `lg:`.
