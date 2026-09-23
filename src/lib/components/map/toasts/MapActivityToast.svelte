<!-- src/lib/components/map/toasts/MapActivityToast.svelte -->
<!-- Rich map-activity toast content, rendered via sonner's `toast.custom()`.
     House format (left → right):
       [ ACTION icon ] — vehicle icon (body colour), vehicle + the trail
                         button's squiggle glyph for trails, or marker
                         image(s); old → new icons when a vehicle type or
                         marker icon changed
       [ title ]       — the PERSON doing it (account/display name)
       [ subtitle ]    — what happened + details ("Changed the marker icon
                         - Silo 3", "Ended the trail - 5 hours")
       [ action btn ]  — optional (e.g. Locate); the WHOLE toast is its
                         hit area when present
     Text wraps freely (no truncation). Custom toast because sonner's
     standard `icon` slot renders WITHOUT props (data-driven icons can't
     reach it), and a description component always stacks BELOW the title.
     The dark card itself comes from the global .toast-dark-heavy-border
     theme class on the toast element (pass `class` + `style` at the call
     site: style "width: var(--width, 356px);" so sizing matches). -->
<script>
  import { onMount } from "svelte"
  import { ArrowRight, MapPin, Users } from "lucide-svelte"
  import SVGComponents from "$lib/vehicles/index.js"
  import TintedIconPreview from "$lib/components/map/markers/TintedIconPreview.svelte"
  import { MARKER_COLOR_DEFAULT } from "$lib/components/map/markers/markerPalette"
  import { isSvgRenderedIcon } from "$lib/components/map/markers/markerSvgRenderer"

  /** Bold first line — the PERSON doing it ("Lachie McDonald"). */
  export let title = ""
  /** Dim second line — what happened + details ("Ended the trail - 5 hours"). */
  export let subtitle = null
  /** "vehicle" | "trail" | "marker" | "people" (people = fallback glyph). */
  export let kind = "people"
  /** Vehicle icon inputs (secondary = the "new" side of an old → new). */
  export let vehicleType = null
  export let bodyColor = null
  export let secondaryVehicleType = null
  export let secondaryBodyColor = null
  /** Marker icon classes — the second renders "old → new". */
  export let iconClass = null
  export let secondaryIconClass = null
  /** Marker colour keys — the thumbnails render in the marker's real colour. */
  export let markerColor = null
  export let secondaryMarkerColor = null
  /** Optional action button (e.g. "Locate"). */
  export let actionLabel = null
  export let onAction = null

  let iconPaths = null
  let pathsPromise = null

  onMount(() => {
    if (!pathsPromise) {
      pathsPromise = fetch("/icon-paths.json")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    }
    pathsPromise.then((p) => (iconPaths = p))
  })

  // ⚠️ iconPaths must be referenced DIRECTLY in these reactive expressions —
  // hiding the lookup in a helper function means Svelte never sees the
  // dependency, so the icon wouldn't re-render when the paths finish
  // loading (the "always a generic pin" bug).
  $: VehicleIcon =
    (kind === "vehicle" || kind === "trail") && vehicleType
      ? SVGComponents[vehicleType] || SVGComponents.SimpleTractor
      : null
  $: SecondaryVehicleIcon = secondaryVehicleType
    ? SVGComponents[secondaryVehicleType] || SVGComponents.SimpleTractor
    : null
  /** Icon class ("custom-svg-rock") → the { id, class } definition shape
      TintedIconPreview resolves. */
  function defForIconClass(iconClass) {
    if (!iconClass) return null
    if (iconClass === "default") return { id: "default", class: "default" }
    if (iconClass.startsWith("custom-svg-"))
      return { id: iconClass.slice(11), class: "custom-svg" }
    if (iconClass.startsWith("ionic-"))
      return { id: iconClass.slice(6), class: iconClass }
    return { id: iconClass, class: iconClass }
  }

  $: primaryDef = defForIconClass(iconClass)
  $: secondaryDef = defForIconClass(secondaryIconClass)
  // Renderable = has SVG glyphs, or (pin / mapbox variants) a baked PNG.
  $: primaryRenderable =
    !!iconClass && (isSvgRenderedIcon(iconClass) || !!iconPaths?.[iconClass])
  $: secondaryRenderable =
    !!secondaryIconClass &&
    (isSvgRenderedIcon(secondaryIconClass) || !!iconPaths?.[secondaryIconClass])

  // A toast with an action (e.g. Locate) is one big hit area: tapping
  // anywhere triggers it. The inner button keeps the visual affordance;
  // keyboard users can use the card (when focused) or the button.
  function handleCardClick() {
    if (actionLabel && onAction) onAction()
  }

  function handleCardKeydown(event) {
    if (!actionLabel || !onAction) return
    // Ignore bubbled keys from the inner button — it has its own handler.
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onAction()
    }
  }
</script>

<div
  class="mat"
  class:mat-actionable={actionLabel && onAction}
  role={actionLabel && onAction ? "button" : undefined}
  tabindex={actionLabel && onAction ? 0 : undefined}
  on:click={handleCardClick}
  on:keydown={handleCardKeydown}
>
  <span class="mat-icon">
    {#if kind === "trail"}
      <!-- Same squiggle glyph as the side trail button, ahead of the vehicle -->
      <svg
        class="mat-trail"
        width="16px"
        height="16px"
        viewBox="0 0 32 32"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M30.165 30.887c-1.604 0.076-21.522-0.043-21.522-0.043-12.101-12.151 18.219-16.173-0.521-26.154l-1.311 1.383-1.746-4.582 5.635 0.439-1.128 1.267c23.438 6.83-3.151 19.631 20.594 27.69v0z"
        />
      </svg>
      {#if VehicleIcon}
        <svelte:component
          this={VehicleIcon}
          bodyColor={bodyColor || "red"}
          size="26px"
        />
      {/if}
    {:else if VehicleIcon}
      <svelte:component
        this={VehicleIcon}
        bodyColor={bodyColor || "red"}
        size="26px"
      />
    {:else if kind === "marker" && primaryDef && primaryRenderable}
      {#key iconPaths}
        <span class="mat-marker">
          <TintedIconPreview
            icon={primaryDef}
            colorKey={markerColor || MARKER_COLOR_DEFAULT}
            size={25}
          />
        </span>
      {/key}
    {:else if kind === "marker"}
      <span class="mat-fallback"><MapPin size={17} /></span>
    {:else}
      <span class="mat-fallback"><Users size={15} /></span>
    {/if}
    {#if secondaryIconClass}
      <ArrowRight size={11} class="mat-arrow" />
      {#if secondaryDef && secondaryRenderable}
        {#key iconPaths}
          <span class="mat-marker">
            <TintedIconPreview
              icon={secondaryDef}
              colorKey={secondaryMarkerColor || MARKER_COLOR_DEFAULT}
              size={25}
            />
          </span>
        {/key}
      {:else}
        <span class="mat-fallback"><MapPin size={17} /></span>
      {/if}
    {:else if SecondaryVehicleIcon}
      <ArrowRight size={11} class="mat-arrow" />
      <svelte:component
        this={SecondaryVehicleIcon}
        bodyColor={secondaryBodyColor || bodyColor || "red"}
        size="26px"
      />
    {/if}
  </span>

  <span class="mat-body">
    <span class="mat-title">{title}</span>
    {#if subtitle}<span class="mat-sub">{subtitle}</span>{/if}
  </span>

  {#if actionLabel}
    <button
      class="mat-action"
      on:click|stopPropagation={() => onAction?.()}
      aria-label={actionLabel}
    >
      {actionLabel}
    </button>
  {/if}
</div>

<style>
  .mat {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
  }
  .mat-actionable {
    cursor: pointer;
  }
  .mat-icon {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .mat-icon :global(svg) {
    display: block;
  }
  .mat-marker {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 25px;
    height: 25px;
  }
  .mat-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    /* Match the 25 px icon images so the row height doesn't shift when the
       icon paths finish loading (prevents a stale sonner height measurement). */
    width: 25px;
    height: 25px;
    color: rgba(255, 255, 255, 0.75);
  }
  .mat-arrow {
    color: rgba(255, 255, 255, 0.5);
  }
  .mat-trail {
    color: rgba(255, 255, 255, 0.75);
    flex-shrink: 0;
  }
  .mat-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }
  .mat-title {
    color: #fff;
    font-weight: 600;
    font-size: 12px;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .mat-sub {
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .mat-action {
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.15);
    color: #f7db5c;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    font-weight: 600;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .mat-action:hover {
    background: rgba(255, 255, 255, 0.25);
  }
</style>
