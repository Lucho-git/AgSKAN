<script lang="ts">
  /**
   * The menu for a picked pin. Like the current viewer's, it opens on the
   * map itself, right beside the pin, and stays with it as the map moves:
   * below the pin when there is room, above it when there isn't, sliding
   * along a screen edge before it flips. It is drawn like the paddock's
   * menu: the same card, type and buttons.
   *
   * It shows what kind of pin it is, when it was placed or last changed
   * and by whom, its note, and what is attached to it (areas and lines
   * drawn on the map, and photos) straight away. Marker, Move and Add sit
   * along the bottom; picking a drawing from the list picks it out on the
   * map and the menu moves over to it, and its pencil changes its shape.
   *
   * Choosing a kind or a colour is tried on the pin as it is tapped, and
   * saved once, when the choosing is over.
   */
  import {
    createEventDispatcher,
    onDestroy,
    onMount,
    tick,
    type ComponentType,
  } from "svelte"
  import {
    Camera,
    Check,
    ChevronLeft,
    Eye,
    EyeOff,
    Hand,
    LoaderCircle,
    Move,
    Pencil,
    Pentagon,
    Plus,
    Spline,
    Trash2,
    X,
  } from "lucide-svelte"
  import vehicles from "$lib/vehicles"
  import type { VehicleType } from "$lib/components/mapnext/machines"
  import PinArt from "$lib/components/mapnext/PinArt.svelte"
  import ShapeArt from "$lib/components/mapnext/ShapeArt.svelte"
  import {
    isGrainBinIcon,
    markerColor,
  } from "$lib/components/map/markers/markerPalette"
  import {
    PIN_DEFAULT,
    pinLabel,
    type PinChoice,
    type PinLook,
  } from "$lib/components/mapnext/pins"
  import {
    formatAgo,
    formatDistance,
    formatHa,
  } from "$lib/components/mapnext/format"
  import {
    distanceM,
    projector,
    type LngLat,
  } from "$lib/components/mapnext/geo"
  import type { MapboxMap } from "$lib/components/mapnext/mapStyle"
  import type { PickedShape } from "./liveEngine"
  import type { LivePin, PinDrawing, PinPatch, PinPhoto } from "./liveData"

  export let pin: LivePin
  /** How the pin is drawn for this person (their colour settings applied). */
  export let look: PinLook
  /** Who last changed it: their name and what they drive, if known. */
  export let who: { name: string; type: string; colour: string } | null = null
  export let guest = false
  export let choices: PinChoice[] = []
  export let choiceLook: (iconClass: string) => PinLook
  /** Being dragged to a new place on the map. */
  export let moving = false
  /** The areas and lines attached to this pin. */
  export let drawings: PinDrawing[] = []
  /** The one of them that is picked out, and the box it sits in. */
  export let picked: PickedShape | null = null
  /** Links to this pin's photos, by photo id, as they arrive. */
  export let photoLinks: Record<string, string> = {}
  /** A photo is on its way up. */
  export let uploading = false
  /** The map the menu sits on. */
  export let map: MapboxMap
  /** Where the pin is right now (mid-move, where it has been dragged to). */
  export let place: () => LngLat | null
  /** Screen the menu must keep clear of: the tool rail, the bottom bar. */
  export let insets: { left: number; bottom: number } = { left: 0, bottom: 0 }

  const dispatch = createEventDispatcher<{
    close: void
    change: PinPatch & { note?: string }
    move: boolean
    /** Put the pin down where it has been dragged to. */
    place: void
    remove: void
    draw: "polygon" | "line"
    /** Pick out (or let go of) one of its drawings. */
    drawing: string | null
    removeDrawing: string
    /** Change the shape of one of its drawings. */
    editDrawing: string
    /** Try a kind and colour on the pin without saving them. */
    preview: { iconClass: string; colour: string }
    /** Save whatever was being tried on. */
    commit: void
    photo: File
    removePhoto: PinPhoto
    /** The map needs to sit here for the menu to have room beside the pin. */
    room: LngLat
    /** Open the bin's own card: its level in tonnes, and its settings. */
    bin: void
  }>()

  // The colours the current viewer's pin menu offers. "default" is no colour
  // of its own: the pin takes this person's default, which is sky blue
  // unless their marker settings say otherwise.
  const COLOURS = [
    "default",
    "red",
    "orange",
    "yellow",
    "green",
    "skyblue",
    "blue",
    "purple",
    "pink",
    "black",
  ]
  const swatch = (key: string) =>
    key === "default"
      ? PIN_DEFAULT
      : key === "black"
        ? "#15261C"
        : markerColor(key, "circle-fill").dark

  const COLOUR_NAMES: Record<string, string> = {
    default: "Default",
    red: "Red",
    orange: "Orange",
    yellow: "Yellow",
    green: "Green",
    skyblue: "Sky blue",
    blue: "Blue",
    purple: "Purple",
    pink: "Pink",
    black: "Black",
  }
  /** The colour or kind under the finger, named as it is passed over. */
  let overColour: string | null = null
  let overKind: string | null = null

  let view: "main" | "edit" | "add" = "main"
  /** The photo opened to fill the screen. */
  let viewing: PinPhoto | null = null
  let fileInput: HTMLInputElement
  let note = pin.note
  let noting = false
  let noteField: HTMLTextAreaElement | null = null
  let lastPin = pin.id
  let armed = false
  let armedTimer: ReturnType<typeof setTimeout>
  // A different pin: start from its own note, not the last one's draft.
  $: if (pin.id !== lastPin) {
    lastPin = pin.id
    note = pin.note
    noting = false
    view = "main"
    viewing = null
    armed = false
    settled = false
    trying = null
  }
  $: if (!noting) note = pin.note
  $: if (viewing && !pin.photos.some((photo) => photo.id === viewing?.id))
    viewing = null

  const ringsOf = (drawing: PinDrawing) =>
    drawing.geometry.coordinates as LngLat[][]
  const lineOf = (drawing: PinDrawing) =>
    drawing.geometry.coordinates as LngLat[]

  // How big a drawing is: hectares inside an area, metres along a line.
  function size(drawing: PinDrawing) {
    const rings = drawing.geometry.coordinates as LngLat[] | LngLat[][]
    if (drawing.kind === "line") {
      const line = rings as LngLat[]
      let metres = 0
      for (let i = 1; i < line.length; i++)
        metres += distanceM(line[i - 1], line[i])
      return formatDistance(metres)
    }
    const ring = (rings as LngLat[][])[0] ?? []
    if (ring.length < 3) return ""
    const flat = projector(ring[0])
    const xy = ring.map((point) => flat.toXY(point))
    let twice = 0
    for (let i = 0, j = xy.length - 1; i < xy.length; j = i++)
      twice += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1]
    return `${formatHa(Math.abs(twice) / 2 / 10000)} ha`
  }

  function chosen() {
    const file = fileInput.files?.[0]
    fileInput.value = ""
    if (file) {
      dispatch("photo", file)
      view = "main"
    }
  }

  $: bin = isGrainBinIcon(pin.iconClass)
  $: gate = pin.iconClass === "custom-svg-gate"
  $: rock =
    pin.iconClass === "custom-svg-rock" ||
    pin.iconClass === "custom-svg-rock_pile"
  // The kind and colour being tried on while the Marker view is open: what
  // the menu shows, and what is saved when the view is left.
  let trying: { iconClass: string; colour: string } | null = null
  $: kindNow = trying?.iconClass ?? pin.iconClass
  $: colourNow = trying?.colour ?? (pin.colour || "default")
  function tryOn(change: { iconClass?: string; colour?: string }) {
    trying = { iconClass: kindNow, colour: colourNow, ...change }
    dispatch("preview", trying)
  }
  $: changedLook =
    !!trying &&
    (trying.iconClass !== pin.iconClass ||
      trying.colour !== (pin.colour || "default"))
  function doneTrying() {
    if (trying) dispatch("commit")
    trying = null
    view = "main"
  }
  // Back to how the pin was, nothing saved.
  function cancelTrying() {
    dispatch("preview", {
      iconClass: pin.iconClass,
      colour: pin.colour || "default",
    })
    trying = null
    view = "main"
  }
  // (Typed loosely: each machine's picture takes the same few props.)
  let whoArt: ComponentType | null = null
  $: whoArt =
    who && who.type in vehicles
      ? (vehicles[who.type as VehicleType] as ComponentType)
      : null
  $: when = pin.changed
    ? `Edited ${formatAgo(pin.changed)}`
    : `Placed ${formatAgo(pin.t)}`

  async function writeNote() {
    if (guest) return
    noting = true
    await tick()
    noteField?.focus()
  }
  function saveNote() {
    if (!noting) return
    noting = false
    if (note.trim() !== pin.note) dispatch("change", { note })
  }

  // A tap on the head goes back from a drawing to the pin itself.
  function headTap(e: MouseEvent) {
    if (picked && !(e.target as HTMLElement).closest("button"))
      dispatch("drawing", null)
  }

  function remove() {
    if (!armed) {
      // The current viewer asks for a second tap too.
      armed = true
      clearTimeout(armedTimer)
      armedTimer = setTimeout(() => (armed = false), 2500)
      return
    }
    dispatch("remove")
  }

  // ── Where the menu sits ────────────────────────────────────────────────
  // The current viewer's rules: it grows down from the pin; when it won't
  // fit below it flips to above, but only once sliding along the edge would
  // take it further than the other side would (so it doesn't flicker); and
  // it never leaves the screen sideways.
  let pop: HTMLDivElement
  let left = -9999
  let top = -9999
  let up = false
  let shown = false
  /** It has been on screen, in place, for a couple of frames. */
  let ready = false
  let smooth = false
  let smoothTimer: ReturnType<typeof setTimeout>
  let frame = 0
  /** The map has been moved (once) to make room for the menu. */
  let settled = false
  const SLIDE = 56
  /** From the pin's middle to the menu's near edge. */
  const REACH = 36

  function position() {
    if (!map || !pop) return
    const box = (map.getContainer() as HTMLElement).getBoundingClientRect()
    let x: number
    let above: number
    let below: number
    if (picked && !moving) {
      // Over a drawing: clear of its whole outline.
      const a = map.project([picked.bbox[0], picked.bbox[3]])
      const b = map.project([picked.bbox[2], picked.bbox[1]])
      x = (a.x + b.x) / 2
      above = Math.min(a.y, b.y) - 14
      below = Math.max(a.y, b.y) + 14
    } else {
      const at = place()
      if (!at) return
      const p = map.project(at)
      x = p.x
      above = p.y - REACH
      below = p.y + REACH
    }
    const wide = pop.offsetWidth || 300
    const tall = pop.offsetHeight || 360
    shown =
      x > -60 && x < box.width + 60 && below > 0 && above < box.height + 60
    const topEdge = 8
    const bottomEdge = 8 + insets.bottom
    if (moving) {
      // Mid-move the menu rides with the pin and never jumps sides.
      left = box.left + x
      top = box.top + (up ? above - 14 : below + 14)
      return
    }
    const fits = tall <= box.height - topEdge - bottomEdge
    const upSlide = Math.max(0, tall + topEdge - above)
    const downSlide = Math.max(0, below - (box.height - bottomEdge - tall))
    if (fits) {
      if (up && upSlide > SLIDE && upSlide > downSlide) up = false
      else if (!up && downSlide > SLIDE && downSlide > upSlide) up = true
    }
    let y = up ? above : below
    if (up) y = Math.min(Math.max(y, tall + topEdge), box.height - bottomEdge)
    else y = Math.min(Math.max(y, topEdge), box.height - tall - bottomEdge)
    x = Math.min(
      Math.max(x, insets.left + wide / 2 + 8),
      box.width - wide / 2 - 8,
    )
    left = box.left + x
    top = box.top + y
  }

  function positionSmooth() {
    // (Only once it has been drawn where it belongs: gliding to its first
    // place would bring it flying in from the corner of the screen.)
    smooth = !moving && ready
    position()
    clearTimeout(smoothTimer)
    smoothTimer = setTimeout(() => (smooth = false), 320)
  }

  /**
   * A pin in the middle of a small screen leaves no room for the menu on
   * either side of it: the map is nudged, once, so the pin sits near the top
   * with the menu under it.
   */
  function makeRoom() {
    if (settled || !map || !pop || picked || moving) return
    settled = true
    const at = place()
    if (!at) return
    const container = map.getContainer() as HTMLElement
    const wide = container.clientWidth
    const tall = container.clientHeight
    const menu = pop.offsetHeight || 360
    const p = map.project(at)
    const roomBelow = tall - 8 - insets.bottom - (p.y + REACH)
    const roomAbove = p.y - REACH - 8
    const half = (pop.offsetWidth || 300) / 2
    const sideways = p.x < insets.left + half + 8 || p.x > wide - half - 8
    if (!sideways && (roomBelow >= menu || roomAbove >= menu)) return
    const targetY = Math.max(
      70,
      Math.min(tall - 8 - insets.bottom - menu - REACH, tall * 0.3),
    )
    const targetX = sideways ? insets.left + (wide - insets.left) / 2 : p.x
    const centre = map.unproject([
      p.x + wide / 2 - targetX,
      p.y + tall / 2 - targetY,
    ])
    dispatch("room", [centre.lng, centre.lat])
  }

  // Mid-move the pin is eased towards the finger frame by frame.
  function follow() {
    position()
    frame = moving ? requestAnimationFrame(follow) : 0
  }
  $: if (moving && !frame && typeof requestAnimationFrame !== "undefined")
    frame = requestAnimationFrame(follow)

  let watcher: ResizeObserver | null = null
  onMount(() => {
    position()
    map.on("move", position)
    map.on("resize", position)
    if (typeof ResizeObserver !== "undefined") {
      watcher = new ResizeObserver(positionSmooth)
      watcher.observe(pop)
    }
    tick().then(() => {
      position()
      makeRoom()
      requestAnimationFrame(() => requestAnimationFrame(() => (ready = true)))
    })
  })
  onDestroy(() => {
    map?.off("move", position)
    map?.off("resize", position)
    watcher?.disconnect()
    clearTimeout(smoothTimer)
    clearTimeout(armedTimer)
    if (frame) cancelAnimationFrame(frame)
  })
  // The pin (or the drawing the menu sits over) changed: move with it.
  $: if (pop && (pin || picked !== undefined || insets)) {
    positionSmooth()
    if (!settled) tick().then(makeRoom)
  }
</script>

<div
  bind:this={pop}
  class="pp"
  class:up
  class:smooth
  class:moving
  class:hidden={!shown}
  class:unplaced={!ready}
  style="left: {left}px; top: {top}px"
  role="dialog"
  aria-label={pin.note || pinLabel(pin.iconClass)}
>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="pp-head" on:click={headTap}>
    <PinArt look={trying ? { ...look, ...trying } : look} size={38} />
    <div class="about">
      <h2>{pinLabel(kindNow)}</h2>
      <p>
        {#if who}
          <span
            class="who"
            title="{pin.changed ? 'Changed' : 'Placed'} by {who.name}"
          >
            {#if whoArt}
              <svelte:component
                this={whoArt}
                size="16px"
                bodyColor={who.colour}
                outlineColor="#ffffff"
                wheelColor="#15261C"
                loadColor="#F7DB5C"
              />
            {/if}
            {who.name.trim().split(/\s+/)[0]}
          </span>
        {/if}
        {when}
      </p>
    </div>
    <button
      type="button"
      class="x"
      aria-label="Close"
      on:click={() => {
        if (trying) dispatch("commit")
        dispatch("close")
      }}
    >
      <X size={18} />
    </button>
  </div>

  {#if moving}
    <p class="pp-hint"><Hand size={16} /> Drag the pin to move it</p>
    <div class="pp-foot two">
      <button type="button" on:click={() => dispatch("move", false)}>
        Put it back
      </button>
      <button type="button" class="go" on:click={() => dispatch("place")}>
        <Check size={17} strokeWidth={3} /> Place
      </button>
    </div>
  {:else if view === "edit"}
    <!-- ── The marker itself: its colour, and what kind it is ── -->
    <div class="pp-sub">
      <button
        type="button"
        class="back"
        on:click={() => (trying ? cancelTrying() : (view = "main"))}
      >
        <ChevronLeft size={16} /> Back
      </button>
      <span>Marker</span>
    </div>
    <div class="pp-body">
      {#if !bin}
        <p class="pp-title">
          Colour ·
          <b>{COLOUR_NAMES[overColour ?? colourNow] ?? ""}</b>
        </p>
        <div class="pp-colours" role="group" aria-label="Pin colour">
          {#each COLOURS as key}
            <button
              type="button"
              class:selected={colourNow === key}
              style="--swatch: {swatch(key)}"
              aria-label={COLOUR_NAMES[key] ?? key}
              title={COLOUR_NAMES[key] ?? key}
              aria-pressed={colourNow === key}
              on:pointerenter={() => (overColour = key)}
              on:pointerleave={() => (overColour = null)}
              on:click={() => colourNow !== key && tryOn({ colour: key })}
            ></button>
          {/each}
        </div>
      {/if}
      <p class="pp-title">
        Kind ·
        <b>
          {choices.find((choice) => choice.iconClass === (overKind ?? kindNow))
            ?.label ?? pinLabel(kindNow)}
        </b>
      </p>
      <!-- Five across, pictures only, as the current viewer has them: the
           one wanted is quicker to find. Its name shows above. -->
      <div class="pp-kinds">
        {#each choices as choice (choice.iconClass)}
          <button
            type="button"
            class:selected={kindNow === choice.iconClass}
            aria-label={choice.label}
            title={choice.label}
            aria-pressed={kindNow === choice.iconClass}
            on:pointerenter={() => (overKind = choice.iconClass)}
            on:pointerleave={() => (overKind = null)}
            on:click={() =>
              choice.iconClass !== kindNow &&
              tryOn({ iconClass: choice.iconClass })}
          >
            <PinArt
              look={{
                ...choiceLook(choice.iconClass),
                colour:
                  colourNow !== "default"
                    ? colourNow
                    : choiceLook(choice.iconClass).colour,
              }}
              size={36}
            />
          </button>
        {/each}
      </div>
    </div>
    {#if changedLook}
      <!-- Something has been changed: one plain button to keep it. -->
      <div class="pp-foot two">
        <button type="button" on:click={cancelTrying}>Cancel</button>
        <button type="button" class="go" on:click={doneTrying}>
          <Check size={18} strokeWidth={3} /> Confirm
        </button>
      </div>
    {/if}
  {:else if view === "add"}
    <!-- ── Adding to the pin: something drawn, or a photo ── -->
    <div class="pp-sub">
      <button type="button" class="back" on:click={() => (view = "main")}>
        <ChevronLeft size={16} /> Back
      </button>
      <span>Add to this pin</span>
    </div>
    <div class="pp-body">
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        hidden
        on:change={chosen}
      />
      <div class="pp-add">
        <button type="button" on:click={() => dispatch("draw", "polygon")}>
          <Pentagon size={22} />
          <strong>An area</strong>
          <span>Tap round it on the map</span>
        </button>
        <button type="button" on:click={() => dispatch("draw", "line")}>
          <Spline size={22} />
          <strong>A line</strong>
          <span>A drain, a fence, a way in</span>
        </button>
        <button
          type="button"
          disabled={uploading}
          on:click={() => fileInput.click()}
        >
          {#if uploading}
            <span class="mn-spin"><LoaderCircle size={22} /></span>
            <strong>Sending…</strong>
          {:else}
            <Camera size={22} />
            <strong>A photo</strong>
            <span>Take one, or pick one</span>
          {/if}
        </button>
      </div>
    </div>
  {:else}
    <div class="pp-body">
      {#if !guest}
        {#if gate}
          <div class="mn-pair" role="group" aria-label="Gate">
            <button
              type="button"
              aria-pressed={!pin.gateOpen}
              on:click={() =>
                pin.gateOpen && dispatch("change", { gateOpen: false })}
              >Closed</button
            >
            <button
              type="button"
              aria-pressed={pin.gateOpen}
              on:click={() =>
                !pin.gateOpen && dispatch("change", { gateOpen: true })}
              >Open</button
            >
          </div>
        {/if}
        {#if rock}
          <div class="mn-pair" role="group" aria-label="Rock">
            <button
              type="button"
              aria-pressed={!pin.rockPicked}
              on:click={() =>
                pin.rockPicked && dispatch("change", { rockPicked: false })}
              >Not picked</button
            >
            <button
              type="button"
              aria-pressed={pin.rockPicked}
              on:click={() =>
                !pin.rockPicked && dispatch("change", { rockPicked: true })}
              >Picked</button
            >
          </div>
        {/if}
        {#if bin}
          <label class="mn-slider">
            <span class="pp-title">How full · {Math.round(pin.fill)}%</span>
            <input
              class="mn-scrub"
              type="range"
              min="0"
              max="100"
              step="5"
              value={pin.fill}
              style="--done: {pin.fill}%"
              on:change={(e) =>
                dispatch("change", { fill: Number(e.currentTarget.value) })}
            />
          </label>
          <button
            type="button"
            class="pp-binset"
            on:click={() => dispatch("bin")}
          >
            Tonnes and bin settings
          </button>
        {/if}
      {/if}

      <!-- The note: tap it to write. -->
      <div class="pp-row">
        <p class="pp-title">Note</p>
        {#if pin.note && !guest}
          <button
            type="button"
            class="pp-label"
            role="switch"
            aria-checked={pin.noteVisible}
            on:click={() =>
              dispatch("change", { noteVisible: !pin.noteVisible })}
          >
            {#if pin.noteVisible}<Eye size={14} />{:else}<EyeOff
                size={14}
              />{/if}
            Map label
            <i></i>
          </button>
        {/if}
      </div>
      {#if noting}
        <div class="pp-note writing">
          <textarea
            bind:this={noteField}
            bind:value={note}
            rows="2"
            maxlength="500"
            placeholder={bin ? "What's in it, or a note" : "Add a note"}
            on:blur={saveNote}
          ></textarea>
          <button
            type="button"
            aria-label="Save the note"
            on:mousedown|preventDefault={saveNote}
          >
            <Check size={17} strokeWidth={3} />
          </button>
        </div>
      {:else}
        <button
          type="button"
          class="pp-note"
          class:empty={!pin.note}
          disabled={guest}
          on:click={writeNote}
        >
          <span>{pin.note || (guest ? "No note" : "Tap to add a note…")}</span>
          {#if !guest}<Pencil size={14} />{/if}
        </button>
      {/if}

      <!-- What is attached: shown straight away. -->
      {#if drawings.length}
        <div class="pp-row">
          <p class="pp-title">Drawn on the map</p>
          {#if !guest}
            <button
              type="button"
              class="pp-label"
              role="switch"
              aria-checked={pin.drawingsAlways}
              on:click={() =>
                dispatch("change", { drawingsAlways: !pin.drawingsAlways })}
            >
              Always show
              <i></i>
            </button>
          {/if}
        </div>
        <ul class="pp-drawn">
          {#each drawings as drawing (drawing.id)}
            <li class:picked={picked?.id === drawing.id}>
              <button
                type="button"
                class="pick"
                aria-pressed={picked?.id === drawing.id}
                on:click={() =>
                  dispatch(
                    "drawing",
                    picked?.id === drawing.id ? null : drawing.id,
                  )}
              >
                {#if drawing.kind === "line"}
                  <ShapeArt
                    line={lineOf(drawing)}
                    colour={drawing.colour}
                    size={28}
                  />
                {:else}
                  <ShapeArt
                    polygons={[ringsOf(drawing)]}
                    colour={drawing.colour}
                    size={28}
                  />
                {/if}
                <span>
                  {drawing.kind === "line" ? "Line" : "Area"}
                  <small>{size(drawing)}</small>
                </span>
              </button>
              {#if !guest}
                <button
                  type="button"
                  class="pen"
                  aria-label="Change the shape of this {drawing.kind === 'line'
                    ? 'line'
                    : 'area'}"
                  on:click={() => dispatch("editDrawing", drawing.id)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  class="bin"
                  aria-label="Remove this drawing"
                  on:click={() => dispatch("removeDrawing", drawing.id)}
                >
                  <Trash2 size={15} />
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if pin.photos.length || uploading}
        <p class="pp-title">Photos</p>
        <div class="pp-photos">
          {#each pin.photos as photo (photo.id)}
            <button
              type="button"
              aria-label="Open this photo"
              style={photoLinks[photo.id]
                ? `background-image: url("${photoLinks[photo.id]}")`
                : ""}
              on:click={() => (viewing = photo)}
            ></button>
          {/each}
          {#if uploading}
            <span class="mn-spin"><LoaderCircle size={20} /></span>
          {/if}
        </div>
      {/if}
    </div>

    {#if !guest}
      <button type="button" class="pp-delete" class:armed on:click={remove}>
        <Trash2 size={16} />
        {armed ? "Tap again to delete" : "Delete pin"}
      </button>
      <div class="pp-foot">
        <button type="button" on:click={() => (view = "edit")}>
          <Pencil size={17} /> Marker
        </button>
        <button type="button" on:click={() => dispatch("move", true)}>
          <Move size={17} /> Move
        </button>
        <button type="button" on:click={() => (view = "add")}>
          <Plus size={18} /> Add
        </button>
      </div>
    {/if}
  {/if}
</div>

{#if viewing}
  <!-- A photo, filling the screen. -->
  <div class="mn-lightbox" role="dialog" aria-label="Photo">
    {#if photoLinks[viewing.id]}
      <img src={photoLinks[viewing.id]} alt="Attached to this pin" />
    {:else}
      <span class="mn-spin"><LoaderCircle size={32} /></span>
    {/if}
    <div class="bar">
      {#if !guest}
        <button
          type="button"
          class="danger"
          on:click={() => viewing && dispatch("removePhoto", viewing)}
        >
          <Trash2 size={18} /> Remove
        </button>
      {/if}
      <button type="button" on:click={() => (viewing = null)}>
        <X size={18} /> Close
      </button>
    </div>
  </div>
{/if}

<style>
  /* On the map beside the pin, drawn as the paddock's menu is: the same
     card, the head and the buttons fixed and only the middle scrolling. */
  .pp {
    --y: 0%;
    position: fixed;
    z-index: 14;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(324px, calc(100vw - 16px));
    max-height: min(450px, calc(100dvh - 90px));
    padding: 12px;
    border-radius: 20px;
    background: var(--lp-card);
    box-shadow:
      0 0 0 1.5px var(--lp-ink),
      0 18px 38px -14px rgba(10, 25, 15, 0.75);
    color: var(--lp-ink);
    transform: translate(-50%, var(--y));
    animation: pp-in 0.2s ease-out;
  }
  .pp.up {
    --y: -100%;
  }
  .pp.smooth {
    transition:
      transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      top 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .pp.hidden {
    opacity: 0;
    pointer-events: none;
  }
  /* Until it has been drawn in place it never glides anywhere. */
  .pp.unplaced {
    transition: none !important;
  }
  .pp.moving {
    box-shadow:
      0 0 0 2px #d97706,
      0 18px 38px -14px rgba(10, 25, 15, 0.75);
  }
  @keyframes pp-in {
    from {
      opacity: 0;
    }
  }
  .pp-head {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
  }
  .pp-head .about {
    flex: 1;
    min-width: 0;
  }
  .pp-head h2 {
    overflow: hidden;
    font-size: 1.1rem;
    font-weight: 800;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pp-head p {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    font-size: 0.76rem;
    color: var(--lp-ink-soft);
    white-space: nowrap;
  }
  /* Who placed or changed it: their machine and first name. */
  .pp-head .who {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    padding: 1px 8px 1px 4px;
    border-radius: 99px;
    background: var(--lp-paper-2);
    font-weight: 700;
    color: var(--lp-ink);
  }
  .pp-head .x {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    color: var(--lp-ink-soft);
  }
  .pp-head .x:hover {
    background: var(--lp-paper-2);
  }
  .pp-sub {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
    font-family: var(--lp-mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lp-ink-soft);
    text-transform: uppercase;
  }
  .pp-sub .back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 36px;
    padding: 0 13px 0 7px;
    border: 1.5px solid var(--lp-line);
    border-radius: 99px;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0;
    color: var(--lp-ink);
    text-transform: none;
  }
  .pp-body {
    display: grid;
    flex: 1;
    align-content: start;
    gap: 8px;
    min-height: 0;
    /* Room for a ring round whatever is picked, so it isn't cut off. */
    padding: 3px;
    margin: -3px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .pp-title {
    font-family: var(--lp-mono);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--lp-ink-soft);
    text-transform: uppercase;
  }
  .pp-title b {
    font-weight: 700;
    color: var(--lp-ink);
  }
  .pp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 22px;
  }
  /* A small switch beside a title: map label, always show. */
  .pp-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .pp-label i {
    position: relative;
    width: 32px;
    height: 19px;
    border-radius: 99px;
    background: var(--lp-line);
    transition: background 0.15s;
  }
  .pp-label i::after {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    content: "";
    transition: transform 0.15s;
  }
  .pp-label[aria-checked="true"] i {
    background: var(--lp-ink);
  }
  .pp-label[aria-checked="true"] i::after {
    transform: translateX(13px);
  }
  /* The note is an info block, like a paddock's name: tap it to write. */
  .pp-note {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 46px;
    padding: 8px 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 14px;
    background: var(--lp-paper);
    color: var(--lp-ink-soft);
    text-align: left;
  }
  .pp-note:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .pp-note span {
    flex: 1;
    min-width: 0;
    font-size: 0.98rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--lp-ink);
    overflow-wrap: anywhere;
  }
  .pp-note.empty span {
    font-weight: 600;
    color: var(--lp-ink-soft);
  }
  .pp-note.writing {
    align-items: stretch;
    padding: 0;
    border-color: var(--lp-ink);
    background: var(--lp-card);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lp-yellow) 60%, transparent);
  }
  .pp-note textarea {
    flex: 1;
    min-width: 0;
    padding: 10px 4px 10px 12px;
    background: none;
    font-size: 1rem;
    line-height: 1.35;
    color: var(--lp-ink);
    outline: none;
    resize: none;
  }
  .pp-note.writing button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    margin: 4px;
    border-radius: 11px;
    background: var(--lp-yellow);
    color: #15261c;
  }
  .pp-drawn {
    display: grid;
    gap: 5px;
  }
  .pp-drawn li {
    display: flex;
    align-items: center;
    border: 1.5px solid var(--lp-line);
    border-radius: 13px;
  }
  .pp-drawn li.picked {
    border-color: var(--lp-ink);
    background: var(--lp-yellow);
  }
  .pp-drawn .pick {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 9px;
    min-width: 0;
    min-height: 44px;
    padding: 0 6px 0 10px;
    font-size: 0.94rem;
    font-weight: 700;
    color: var(--lp-ink);
    text-align: left;
  }
  .pp-drawn li.picked .pick {
    color: #15261c;
  }
  .pp-drawn small {
    margin-left: 5px;
    font-family: var(--lp-mono);
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--lp-ink-soft);
  }
  .pp-binset {
    min-height: 38px;
    border: 1.5px solid var(--lp-line);
    border-radius: 12px;
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--lp-ink);
  }
  .pp-binset:hover {
    border-color: var(--lp-ink);
  }
  .pp-drawn .bin,
  .pp-drawn .pen {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 44px;
    color: var(--lp-rust);
  }
  .pp-drawn .pen {
    color: var(--lp-ink);
  }
  .pp-photos {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 5px;
    align-items: center;
  }
  .pp-photos button {
    aspect-ratio: 1;
    border-radius: 10px;
    background: var(--lp-paper-2) center / cover;
  }
  /* Ten colours in one row, each with room for its ring. */
  .pp-colours {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 4px;
  }
  .pp-colours button {
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: inset 0 0 0 1.5px rgba(21, 38, 28, 0.35);
  }
  .pp-colours button.selected {
    box-shadow:
      inset 0 0 0 1.5px rgba(21, 38, 28, 0.35),
      0 0 0 2px var(--lp-card),
      0 0 0 3.5px var(--lp-ink);
  }
  /* Kinds of pin: five across, pictures only. */
  .pp-kinds {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 5px;
  }
  .pp-kinds button {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    border: 1.5px solid var(--lp-line);
    border-radius: 13px;
    background: var(--lp-paper);
  }
  .pp-kinds button:hover {
    border-color: var(--lp-ink);
  }
  .pp-kinds button.selected {
    border-color: var(--lp-ink);
    background: var(--lp-yellow);
    box-shadow: inset 0 0 0 1.5px var(--lp-ink);
  }
  .pp-add {
    display: grid;
    gap: 6px;
  }
  .pp-add button {
    display: grid;
    grid-template-columns: 30px 1fr;
    align-items: center;
    gap: 0 10px;
    min-height: 54px;
    padding: 8px 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 14px;
    color: var(--lp-ink);
    text-align: left;
  }
  .pp-add button:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .pp-add button :global(svg),
  .pp-add button .mn-spin {
    grid-row: span 2;
  }
  .pp-add strong {
    font-size: 0.96rem;
    font-weight: 800;
  }
  .pp-add span:not(.mn-spin) {
    font-size: 0.8rem;
    color: var(--lp-ink-soft);
  }
  .pp-add button:disabled {
    opacity: 0.6;
  }
  .pp-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    border: 1.5px dashed rgba(217, 119, 6, 0.6);
    border-radius: 14px;
    background: rgba(245, 158, 11, 0.12);
    font-size: 0.92rem;
    font-weight: 700;
    color: #92400e;
  }
  .pp-delete {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    border: 1.5px solid color-mix(in srgb, var(--lp-rust) 55%, transparent);
    border-radius: 99px;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--lp-rust);
  }
  .pp-delete.armed {
    background: var(--lp-rust);
    color: #fff;
  }
  .pp-foot {
    display: grid;
    flex-shrink: 0;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .pp-foot.two {
    grid-template-columns: 1fr 1fr;
  }
  .pp-foot button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 46px;
    border: 1.5px solid var(--lp-line);
    border-radius: 99px;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--lp-ink);
    white-space: nowrap;
  }
  .pp-foot button:hover {
    border-color: var(--lp-ink);
  }
  .pp-foot .go {
    border-color: var(--lp-ink);
    background: var(--lp-yellow);
    color: #15261c;
  }
</style>
