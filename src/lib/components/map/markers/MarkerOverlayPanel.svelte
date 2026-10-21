<!-- src/lib/components/map/markers/MarkerOverlayPanel.svelte -->
<!-- PROTOTYPE: new on-map overlay menu for regular markers, modelled on the
     silo panel. The MAIN view puts the essentials up front — notes, the
     full drawings panel (same as its old dedicated tab), photos, and an
     Add row — with Icon as the only drill-in sub-view. Plus a Move (drag)
     mode. Currently only attached to the "middle-finger" (at-middle-finger /
     "Rude") marker to trial the UI. The panel has a FIXED height so it
     never jumps between views. -->
<script>
  import { onMount, onDestroy, tick } from "svelte"
  import IconSVG from "$lib/components/general/IconSVG.svelte"
  import {
    X,
    Trash2,
    Move,
    Hand,
    Check,
    ChevronLeft,
    FileText,
    Camera,
    Square,
    Spline,
    Plus,
    MapPin,
    Pencil,
    ChevronDown,
  } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { Capacitor } from "@capacitor/core"
  import {
    Camera as CameraPlugin,
    CameraResultType,
    CameraSource,
  } from "@capacitor/camera"
  import { Filesystem, Directory } from "@capacitor/filesystem"
  import { Share } from "@capacitor/share"
  import { markerPhotoApi } from "$lib/api/markerPhotoApi"
  import { markerApi } from "$lib/api/markerApi"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    getAllMarkers,
    findMarkerByIconClass,
    orderMarkersByUsage,
  } from "$lib/data/markerDefinitions"
  import { mapInteractionsSuppressed } from "$lib/stores/controlStore"
  import { mapAttentionStore } from "$lib/stores/mapAttentionStore"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import {
    TINT_MODE_DEFAULT,
    pickableColorsForStyle,
    MARKER_COLOR_DEFAULT,
    markerColor,
    styleSwatchBg,
    markerDefaultColorKey,
    styleDefaultColor,
    randomColorForId,
    RANDOM_COLOR_KEY,
    isGrainBinIcon,
    isGateIcon,
    isRockIcon,
    gateDisplayIconClass,
  } from "./markerPalette"
  import DrawingPanel from "$lib/components/map/overlays/DrawingPanel.svelte"
  import { blockForViewer } from "$lib/utils/guestMode"
  import PhotoLightbox from "$lib/components/map/markers/PhotoLightbox.svelte"
  import TintedIconPreview from "$lib/components/map/markers/TintedIconPreview.svelte"
  import { fetchMapLogPage, fetchVehicleSnapshots } from "$lib/api/mapLogApi"
  import vehicleComponents from "$lib/vehicles"

  export let map
  /** @type {any} */
  export let marker
  /** @type {import("svelte/store").Writable<any[]>} */
  export let confirmedMarkersStore
  export let selectedMarkerStore
  export let getCurrentIconClass = () => "default"
  export let getIconImageName = (iconClass) => iconClass
  export let updateMarkerNoteLabel = () => {}
  export let removeMarker = () => {}
  export let deselectMarker = () => {}
  export let moveSiloLive = () => {}
  export let commitSiloMove = () => {}
  export let showMoveRipple = () => {}
  export let showEditRipple = () => {}
  export let showPlacementRipple = () => {}

  // View-only guests: write actions (notes, photos, move, delete, edits) are
  // locked — taps show a "Guest mode" tooltip instead of doing anything.
  $: isViewer = $profileStore?.user_type === "viewer"

  // ── Drill-in navigation: main → icon sub-view ──
  let view = "main" // 'main' | 'icon'

  // Hidden only while a drawing session is in progress (panel reopens after).
  let panelOpen = true
  let shouldReopenAfterDrawing = false
  let previousMarkerId = null
  let drawingPanelRef = null
  let lastMarkerId = null

  // ── Panel positioning ──
  let left = -9999
  let top = -9999
  let visible = false
  let offscreen = false
  // True while the menu opens upward; false by default so the menu GROWS
  // DOWNWARD from the marker (flips up only when it won't fit below).
  let openUp = false
  // When a drawing is selected, the panel anchors just above the drawing's
  // on-screen box instead of the marker. null = anchored to the marker.
  let drawingAnchor = null
  // The rendered panel element (used to measure its height for camera jumps).
  let markerPopEl = null
  // Smooth repositioning (flip/slide after a view or size change) — off
  // during normal map tracking so the menu follows the marker instantly.
  let smoothReposition = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let smoothRepositionTimer = null
  /** @type {ResizeObserver | null} */
  let resizeObserver = null
  /** @type {number} */
  let lastMenuHeight = 0
  // How far the menu may slide against a screen edge before flipping.
  const SLIDE_BUFFER = 56
  // Stepped aside while the full-width bottom style editor is open.
  let hideForEditor = false
  // True while an edge badge points at the off-screen host marker (because
  // the panel is focused on one of its drawings).
  let drawingFocusActive = false

  // ── Move mode (drag the marker, like the silo) ──
  let moving = false
  let dragging = false
  let liveCoords = null
  let attentionActive = false
  let originalCoords = null
  let originX = -9999
  let originY = -9999

  // Half-size (px) of the hit square around the icon that starts a move.
  const ICON_DRAG_HALF = 26
  // Smooth lerp follow: the marker eases toward the cursor's position each
  // frame so it glides (snap-to-cursor without the jarring teleport).
  const LERP_FACTOR = 0.35
  let dragTargetX = null
  let dragTargetY = null
  let dragRafId = null
  let lastDragFrame = 0

  // ── Notes ──
  let notesText = ""
  let noteLabelVisible = true
  let originalNotes = ""
  let noteEditing = false // true while the note textarea is open
  let noteSavedFlash = false // brief "✓ Saved" chip after confirming a note
  let noteSavedTimer = null
  let noteInputEl = null

  // ── Icon editing ──
  let selectedIconForEdit = null
  let pendingIconChange = false
  let originalIconClass = null
  let pendingMarkerId = null
  let previewIconClass = null

  // The bottom "Update marker" button shows whenever anything is pending:
  // an icon/colour preview, or a note that hasn't been saved yet.
  $: hasChanges =
    pendingIconChange || notesText.trim() !== (originalNotes || "").trim()

  // ── Marker colour (option A: runtime-tinted icons) ──
  let markerColorKey = MARKER_COLOR_DEFAULT

  // ── Colour box picker (square trigger → popover grid, like the profile) ──
  let colorBoxOpen = false
  // "Set as default" check next to Save — appears ONLY right after a colour
  // change to a non-default colour; arming it makes Save also set the default.
  let makeDefaultVisible = false
  let makeDefaultArmed = false
  $: markerStyle = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT
  function toggleColorBox() {
    colorBoxOpen = !colorBoxOpen
  }
  function pickMenuColor(/** @type {string} */ key) {
    colorBoxOpen = false
    setMarkerColor(key)
  }
  // The colour the box trigger shows: the marker's explicit colour, or the
  // effective header colour when set to Default. Reactive (reads the state
  // directly) so the box updates the instant a colour is picked.
  $: menuTriggerColorKey =
    markerColorKey === MARKER_COLOR_DEFAULT ? headerColorKey : markerColorKey

  function setMarkerColor(/** @type {string} */ key) {
    if (!marker) return
    markerColorKey = key
    // Re-arm the Save/confirm button so a colour change can be confirmed too
    // (the icon preview arms it as well; both are committed together on
    // Save). The colour itself still commits live so the map re-tints.
    if (!pendingIconChange) {
      pendingIconChange = true
      pendingMarkerId = marker.id
    }
    // Commit to the store so MapStateSaver persists it (marker_color) and
    // refreshMapMarkers swaps the icon to the tinted variant.
    confirmedMarkersStore.update((/** @type {any[]} */ markers) =>
      markers.map((/** @type {any} */ m) =>
        m.id === marker.id
          ? { ...m, markerColor: key, updated_at: new Date().toISOString() }
          : m,
      ),
    )
    // Show the "set as default" check ONLY right after picking a non-default
    // colour — never just from opening/reopening the colour menu.
    makeDefaultArmed = false
    makeDefaultVisible = key !== MARKER_COLOR_DEFAULT
  }

  // Set the picked colour as the DEFAULT for this marker type (the per-type
  // override in the "Marker default colours" profile settings, custom mode).
  async function applyDefaultColour() {
    if (!marker || markerColorKey === MARKER_COLOR_DEFAULT) return
    const iconClass = marker.iconClass || ""
    const mode = $userSettingsStore?.markerDefaultColorMode || "custom"
    const single = $userSettingsStore?.markerDefaultColor || "blue"
    const perType = {
      ...($userSettingsStore?.markerTypeDefaultColors || {}),
    }
    perType[iconClass] = markerColorKey
    const result = await userSettingsApi.updateMarkerDefaultColors(
      mode,
      single,
      perType,
    )
    const typeName =
      findMarkerByIconClass(iconClass)?.name || "this marker type"
    if (result?.success) {
      toast.success(`Default colour set for ${typeName}`)
    } else {
      toast.error(result?.message || "Failed to set default colour")
    }
  }

  let confirmDelete = false

  // ── Photos ──
  let photos = [] // { id, path, url, created_at }
  let photosLoading = false
  let photoUploading = false
  let viewingPhoto = null // photo currently shown in the full-screen viewer
  // Index of the photo being viewed (drives the PhotoSwipe lightbox).
  $: viewerIndex = Math.max(
    0,
    photos.findIndex((p) => p.id === viewingPhoto?.id),
  )
  // Small "copied" feedback on the coordinates button.
  let copiedCoords = false
  let copiedCoordsTimer = null
  // Armed delete (second tap confirms) — auto-disarms.
  let confirmDeleteTimer = null
  let addMenuOpen = false // footer "+ Add" dropdown

  $: markerName = marker
    ? findMarkerByIconClass(marker.iconClass)?.name || "Marker"
    : "Marker"
  $: displayIconClass =
    previewIconClass ||
    gateDisplayIconClass(getCurrentIconClass(marker?.id), marker?.gateOpen)
  // Marker definition for the header thumbnail (real map preview).
  $: headerIconDef =
    findMarkerByIconClass(displayIconClass) ||
    findMarkerByIconClass(marker?.iconClass) ||
    null
  // Gate markers (special): open/closed toggle lives in the main view.
  $: isGate = isGateIcon(marker?.iconClass)
  // Rock markers (special): "picked" toggle lives in the main view.
  $: isRock = isRockIcon(marker?.iconClass)

  // The colour shown in the header badge + colour-menu tag: the marker's
  // explicit colour, or if it's set to Default, the colour the "Marker
  // default colours" profile settings actually resolve to (per-type override
  // → built-in preset → single; "random" → stable per-marker colour).
  $: headerColorKey = (() => {
    const explicit = markerColorKey
    if (
      explicit &&
      explicit !== MARKER_COLOR_DEFAULT &&
      explicit !== RANDOM_COLOR_KEY
    ) {
      return explicit
    }
    let key = markerDefaultColorKey(marker?.iconClass, $userSettingsStore || {})
    if (key === RANDOM_COLOR_KEY) key = randomColorForId(marker?.id)
    if (!key) key = styleDefaultColor(markerStyle)
    return key
  })()
  $: headerColorDef = markerColor(headerColorKey)

  const allMarkerIcons = getAllMarkers()
  // Atlas (at-*) outline icons are being phased out: they still render for
  // existing markers on the map but are no longer offered in the pickers.
  $: selectableMarkers = orderMarkersByUsage(
    allMarkerIcons.filter((m) => m.active && !m.class.startsWith("at-")),
    $userSettingsStore?.markerUsageOrder || [],
  )
  // Standard icons vs icons with special functionality (marked `special: true`
  // in markerDefinitions) — rendered as separate groups with a divider.
  $: standardMarkers = selectableMarkers.filter((m) => !m.special)
  $: specialMarkers = selectableMarkers.filter((m) => m.special)

  // Sync local state when the marker changes.
  $: {
    const id = marker?.id
    if (id !== lastMarkerId) {
      lastMarkerId = id
      notesText = marker?.notes || ""
      originalNotes = marker?.notes || ""
      noteLabelVisible = marker?.noteLabelVisible !== false
      markerColorKey = marker?.markerColor || MARKER_COLOR_DEFAULT
      noteEditing = false
      noteSavedFlash = false
      openUp = false
      confirmDelete = false
      addMenuOpen = false
      view = "main"
      panelOpen = true
      colorBoxOpen = false
      makeDefaultVisible = false
      makeDefaultArmed = false
      loadPhotos()
      resetIconEdit()
    }
  }

  // Has the marker been dragged out of the origin ring?
  $: movedFromOrigin = (() => {
    if (!moving || !originalCoords || !liveCoords || !map) return false
    try {
      const p = map.project(originalCoords)
      const q = map.project(liveCoords)
      return Math.hypot(q.x - p.x, q.y - p.y) > 22
    } catch {
      return false
    }
  })()

  function position() {
    if (!map) return
    try {
      const container = map.getContainer()
      const rect = container.getBoundingClientRect()
      let px
      let py
      let anchoredToDrawing = false

      if (drawingAnchor && !moving) {
        // Anchor the panel just above the drawing's on-screen box so it moves
        // over with the drawing and never covers it.
        const tl = map.project([drawingAnchor.west, drawingAnchor.north])
        const br = map.project([drawingAnchor.east, drawingAnchor.south])
        px = (tl.x + br.x) / 2
        py = Math.min(tl.y, br.y) - 14
        anchoredToDrawing = true
      } else {
        const coords = liveCoords || marker?.coordinates
        if (!coords) return
        const p = map.project(coords)
        px = p.x
        py = p.y
      }

      // Menu box dimensions (match the .marker-pop CSS; measured so the flip
      // uses the real rendered height).
      const menuW = 280
      const menuH = markerPopEl?.offsetHeight || Math.min(400, rect.height - 70)

      // Keep the on/off-screen tests on the raw marker point.
      visible =
        px > -40 && px < rect.width + 40 && py > 60 && py < rect.height + 40
      offscreen =
        px < -4 || px > rect.width + 4 || py < -4 || py > rect.height + 4

      // While moving: no flip, no clamp — the menu tracks the marker freely
      // (even off-screen) so you can see exactly where it sits relative to the
      // viewport edges and pick the spot to lock in. Keep whichever
      // orientation it opened with so the marker sits just OUTSIDE the menu's
      // near edge: below an up menu, above a down menu.
      if (moving) {
        left = rect.left + px
        top = rect.top + (openUp ? py - 44 : py + 44)
      } else {
        // Vertically: open DOWNWARD from the marker by default (grows down);
        // when it won't fit below it flips up, and near the top edge it
        // slides to hug it (8px gap) instead of snapping. Only flip once the
        // slide would be too big AND the other side fits better (hysteresis).
        const topMargin = 8
        const bottomMargin = 8
        const fitsVertically = menuH <= rect.height - topMargin - bottomMargin
        const idealUpAnchor = py - 44 // open up → menu bottom sits here
        const idealDownAnchor = py + 44 // open down → menu top sits here
        // How far we'd have to push the menu toward its marker to keep it on
        // screen in each orientation (0 when it fits at the ideal spot).
        const upSlide = Math.max(0, menuH + topMargin - idealUpAnchor)
        const downSlide = Math.max(
          0,
          idealDownAnchor - (rect.height - bottomMargin - menuH),
        )
        if (fitsVertically) {
          if (openUp && upSlide > SLIDE_BUFFER && upSlide > downSlide) {
            openUp = false
          } else if (
            !openUp &&
            downSlide > SLIDE_BUFFER &&
            downSlide > upSlide
          ) {
            openUp = true
          }
        }
        // Taller than the viewport → keep the current orientation; the anchor
        // clamps below + max-height/internal scroll keep it usable.
        let anchorY = openUp ? idealUpAnchor : idealDownAnchor
        if (openUp) {
          anchorY = Math.max(anchorY, menuH + topMargin)
          anchorY = Math.min(anchorY, rect.height - bottomMargin)
        } else {
          anchorY = Math.max(anchorY, topMargin)
          anchorY = Math.min(anchorY, rect.height - menuH - bottomMargin)
        }
        // Horizontally: keep the menu centered on the marker, but shift it so
        // the 280px box never leaves the screen edges.
        px = Math.min(Math.max(px, menuW / 2 + 8), rect.width - menuW / 2 - 8)

        left = rect.left + px
        top = rect.top + anchorY
      }
      if (!anchoredToDrawing && moving && originalCoords) {
        const op = map.project(originalCoords)
        originX = rect.left + op.x
        originY = rect.top + op.y
      } else {
        originX = -9999
        originY = -9999
      }
    } catch {
      visible = false
      offscreen = false
      originX = -9999
      originY = -9999
    }
    updateAttention()
    updateDrawingFocusAttention()
  }

  // ── Drill-in navigation ──
  function goMain() {
    colorBoxOpen = false
    // Leaving the icon picker without saving discards the preview.
    if (pendingIconChange) {
      revertIconChange()
      resetIconEdit()
    }
    view = "main"
  }

  // ── Icon editing (preview live on the map, commit on save) ──
  // The icon class the grid should highlight — the live preview while one is
  // pending, otherwise the marker's committed icon. Passed INTO the per-cell
  // test as an explicit argument so Svelte tracks it: a function call in an
  // {#each} only re-evaluates when a TRACKED dependency changes, and Svelte
  // can't see the variables used inside getIsIconSelected's body.
  $: selectedIconKey = previewIconClass || getCurrentIconClass(marker?.id)
  function getIsIconSelected(icon, selectedKey) {
    if (selectedIconForEdit) {
      return (
        selectedIconForEdit.id === icon.id &&
        selectedIconForEdit.class === icon.class
      )
    }
    if (!selectedKey) {
      return icon.id === "default" && icon.class === "default"
    }
    const iconKey =
      icon.id === "default"
        ? "default"
        : icon.class.startsWith("custom-svg")
          ? `custom-svg-${icon.id}`
          : icon.class
    return iconKey === selectedKey
  }

  function previewIcon(icon) {
    if (!marker) return
    if (!pendingIconChange) {
      originalIconClass = getCurrentIconClass(marker.id)
      pendingIconChange = true
      pendingMarkerId = marker.id
    }
    selectedIconForEdit = icon

    const newIconClass =
      icon.id === "default"
        ? "default"
        : icon.class.startsWith("custom-svg")
          ? `custom-svg-${icon.id}`
          : icon.class

    previewIconClass = newIconClass

    const source = map?.getSource?.("markers")
    const data = source?._data
    const feature = data?.features?.find((f) => f.properties.id === marker.id)
    if (feature) {
      feature.properties.icon = getIconImageName(newIconClass)
      feature.properties.iconClass = newIconClass
      source.setData(data)
    }
    selectedMarkerStore.update((m) =>
      m?.id === marker.id ? { ...m, iconClass: newIconClass } : m,
    )
    // Commit to the confirmed store too so MarkerManager re-renders the
    // marker with its colour/style applied on the map BEFORE Save is pressed
    // (the selection overlay reads confirmedMarkersStore). EXCEPT the grain
    // bins: committing a bin iconClass here would flip selectedIsSilo and
    // switch the menu to the special panel mid-preview. The conversion only
    // happens on Save (confirmIcon commits it, then the special panel opens).
    if (!isGrainBinIcon(newIconClass)) {
      confirmedMarkersStore.update((/** @type {any[]} */ markers) =>
        markers.map((/** @type {any} */ m) =>
          m.id === marker.id
            ? {
                ...m,
                iconClass: newIconClass,
                updated_at: new Date().toISOString(),
              }
            : m,
        ),
      )
    }
  }

  function confirmIcon() {
    if (!marker) return
    const notesDirty = notesText.trim() !== (originalNotes || "").trim()
    if (!pendingIconChange && !notesDirty) return

    // Save any pending note (blur usually already commits it; this covers
    // the case where the field is still focused when Update is clicked).
    if (notesDirty) {
      finishNoteEdit()
    }

    // Icon + colour changes (and the "set as default" check) commit below.
    const newIconClass = pendingIconChange ? previewIconClass : null
    if (pendingIconChange) {
      confirmedMarkersStore.update((markers) =>
        markers.map((m) =>
          m.id === marker.id
            ? {
                ...m,
                ...(newIconClass ? { iconClass: newIconClass } : {}),
                markerColor: markerColorKey,
                updated_at: new Date().toISOString(),
              }
            : m,
        ),
      )

      if (newIconClass) {
        // The preview already committed the new icon to the store, so
        // `marker` holds the NEW class by now — use the class captured when
        // the edit began so the ripple reads "Old → New" (it used to show
        // "New → New").
        const oldClass = originalIconClass || marker.iconClass
        const oldDef = findMarkerByIconClass(oldClass)
        const newDef = findMarkerByIconClass(newIconClass)
        const labelText = `${oldDef?.name || "Marker"} → ${newDef?.name || "Marker"}`
        if (marker.coordinates) showEditRipple(marker.coordinates, labelText)
      } else if (marker.coordinates) {
        // Colour-only confirm — same edit-pulse confirmation visual/effect
        // as an icon change, labelled with the colour that was picked.
        const colourLabel = markerColor(markerColorKey)?.label || "Default"
        showEditRipple(marker.coordinates, `Colour → ${colourLabel}`)
      }

      // If the "set as default" check is armed, apply this colour as the
      // marker type's default too (it shows its own toast confirmation).
      if (makeDefaultVisible && makeDefaultArmed) {
        applyDefaultColour()
      }
    }

    resetIconEdit()
    // Update confirms the change. Converting a marker INTO a special
    // grain bin keeps it selected so its edit panel opens; everything else
    // closes the menu.
    if (!isGrainBinIcon(newIconClass)) {
      deselectMarker()
    }
  }

  function resetIconEdit() {
    selectedIconForEdit = null
    pendingIconChange = false
    originalIconClass = null
    pendingMarkerId = null
    previewIconClass = null
  }

  function revertIconChange() {
    if (!originalIconClass || !pendingMarkerId) return
    const source = map?.getSource?.("markers")
    const data = source?._data
    const feature = data?.features?.find(
      (f) => f.properties.id === pendingMarkerId,
    )
    if (feature) {
      feature.properties.icon = getIconImageName(originalIconClass)
      feature.properties.iconClass = originalIconClass
      source.setData(data)
    }
    // The preview also wrote the icon to the selection store — restore it
    // so the panel shows the confirmed icon, not the last previewed one.
    selectedMarkerStore.update((m) =>
      m?.id === pendingMarkerId ? { ...m, iconClass: originalIconClass } : m,
    )
    // Undo the live-preview commit so the map + store match the original
    // icon (only committed permanently when Save is pressed).
    confirmedMarkersStore.update((/** @type {any[]} */ markers) =>
      markers.map((/** @type {any} */ m) =>
        m.id === pendingMarkerId
          ? {
              ...m,
              iconClass: originalIconClass,
              updated_at: new Date().toISOString(),
            }
          : m,
      ),
    )
    previewIconClass = null
  }

  // ── Notes ──
  // Open the note editor and put the cursor straight into the textarea.
  function startNoteEdit(event) {
    if (blockForViewer(event, isViewer)) return
    noteEditing = true
    tick().then(() => noteInputEl?.focus())
  }

  // Enter (without Shift) confirms the note — blurring triggers the save.
  function onNotesKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      noteInputEl?.blur()
    }
  }

  // Confirm path for both Enter and clicking/tapping away (blur).
  async function finishNoteEdit() {
    noteEditing = false
    await saveNotes()
  }

  async function saveNotes() {
    if (!marker) return
    const trimmed = notesText.trim()
    // Auto-save on blur — skip when nothing changed.
    if (trimmed === originalNotes) return
    try {
      const result = await markerApi.updateMarkerNotes(marker.id, trimmed)
      if (!result.success) throw new Error(result.message)
      confirmedMarkersStore.update((markers) =>
        markers.map((m) =>
          m.id === marker.id
            ? {
                ...m,
                notes: trimmed || undefined,
                noteLabelVisible,
                updated_at: new Date().toISOString(),
              }
            : m,
        ),
      )
      updateMarkerNoteLabel(marker.id, trimmed, noteLabelVisible)
      originalNotes = trimmed
      // Flash the "✓ Saved" chip so the user knows it was reflected.
      noteSavedFlash = true
      clearTimeout(noteSavedTimer)
      noteSavedTimer = setTimeout(() => (noteSavedFlash = false), 1600)
    } catch (error) {
      console.error("Error saving notes:", error)
    }
  }

  // ── Gate open/closed (special gate markers) ──
  // Writes `gateOpen` straight onto the marker in the store — MapStateSaver
  // persists it as properties.gate_open and the map re-renders immediately
  // (MarkerManager resolves the glyph via gateDisplayIconClass).
  function setGateOpen(open, event) {
    if (blockForViewer(event, isViewer)) return
    if (!marker || !isGate) return
    const next = open === true
    if ((marker.gateOpen === true) === next) return
    confirmedMarkersStore.update((markers) =>
      markers.map((m) =>
        m.id === marker.id
          ? { ...m, gateOpen: next, updated_at: new Date().toISOString() }
          : m,
      ),
    )
    selectedMarkerStore.update((m) =>
      m?.id === marker.id ? { ...m, gateOpen: next } : m,
    )
    if (marker.coordinates) {
      showEditRipple(marker.coordinates, `Gate → ${next ? "Open" : "Closed"}`)
    }
  }

  // ── Rock "picked" (special rock / rock-pile markers) ──
  // Instant toggle like the gate — persisted as properties.rock_picked and
  // rendered as a stamped green tick baked into the marker's cached image
  // (markerSvgRenderer buildSvg `picked`) so there is no per-rock DOM cost.
  function setRockPicked(picked, event) {
    if (blockForViewer(event, isViewer)) return
    if (!marker || !isRock) return
    const next = picked === true
    if ((marker.rockPicked === true) === next) return
    confirmedMarkersStore.update((markers) =>
      markers.map((m) =>
        m.id === marker.id
          ? { ...m, rockPicked: next, updated_at: new Date().toISOString() }
          : m,
      ),
    )
    selectedMarkerStore.update((m) =>
      m?.id === marker.id ? { ...m, rockPicked: next } : m,
    )
    if (marker.coordinates) {
      showEditRipple(
        marker.coordinates,
        `Rock → ${next ? "Picked" : "Not picked"}`,
      )
    }
  }

  async function toggleNoteLabel(visible) {
    if (!marker) return
    const previous = noteLabelVisible
    noteLabelVisible = visible
    confirmedMarkersStore.update((markers) =>
      markers.map((m) =>
        m.id === marker.id
          ? {
              ...m,
              noteLabelVisible: visible,
              updated_at: new Date().toISOString(),
            }
          : m,
      ),
    )
    updateMarkerNoteLabel(marker.id, marker.notes, visible)
    const result = await markerApi.updateMarkerNoteVisibility(
      marker.id,
      visible,
    )
    if (!result.success) {
      noteLabelVisible = previous
      updateMarkerNoteLabel(marker.id, marker.notes, previous)
    }
  }

  // ── Provenance: who left the marker, with which machine, and when ──
  // map_markers records no creator, so the map log is the only source: the
  // earliest `marker.placed` row is the author, and vehicle_state turns that
  // actor id into the machine they were running.
  /** @type {null | { creatorName: string, creatorId: string | null, vehicleType: string | null, vehicleColor: string | null, editedByName: string | null, createdIso: string | null, editedIso: string | null }} */
  let provenance = null
  let provenanceFor = null

  $: if (
    marker?.id &&
    $profileStore?.master_map_id &&
    marker.id !== provenanceFor
  ) {
    provenanceFor = marker.id
    provenance = null
    loadProvenance(marker.id, $profileStore.master_map_id)
  }

  async function loadProvenance(markerId, masterMapId) {
    if (!markerId || !masterMapId) return
    try {
      const entries = await fetchMapLogPage(masterMapId, {
        entityId: markerId,
        limit: 25,
      })
      if (!entries.length) return
      // Newest first — the last `marker.placed` is the original creation.
      const placed = entries.filter((e) => e.action === "marker.placed")
      const creator = placed.length ? placed[placed.length - 1] : null
      const latest = entries[0]
      const editor =
        latest.action === "marker.placed" || latest.actor_name === creator?.actor_name
          ? null
          : latest.actor_name

      const vehicles = creator?.actor_id
        ? await fetchVehicleSnapshots([creator.actor_id]).catch(
            () => new Map(),
          )
        : new Map()
      const vehicle = creator?.actor_id ? vehicles.get(creator.actor_id) : null

      if (provenanceFor !== markerId) return
      provenance = {
        creatorName: creator?.actor_name || "",
        creatorId: creator?.actor_id || null,
        vehicleType: vehicle?.vehicleType || null,
        vehicleColor: vehicle?.bodyColor || null,
        editedByName: editor,
        createdIso: creator?.occurred_at || null,
        editedIso: creator ? latest.occurred_at : null,
      }
    } catch (error) {
      console.warn("Marker provenance unavailable:", error?.message || error)
    }
  }

  /** @param {string} iso */
  function shortDate(iso) {
    if (!iso) return ""
    return new Date(iso).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  // "Created 12 Mar" / "Edited 21 Oct" — falls back to the row timestamps when
  // the log has nothing for this marker (old markers, guests, offline).
  $: createdIso =
    provenance?.createdIso || marker?.created_at || marker?.createdAt || null
  $: editedIso = recentEditIso(
    marker?.updated_at || marker?.updatedAt,
    createdIso,
    provenance?.editedIso,
  )
  $: dateLabel = editedIso
    ? `Edited ${shortDate(editedIso)}`
    : createdIso
      ? `Created ${shortDate(createdIso)}`
      : ""
  $: dateTitle = [
    createdIso ? `Created ${shortDate(createdIso)}` : "",
    editedIso ? `Edited ${shortDate(editedIso)}` : "",
    provenance?.editedByName ? `Last edit by ${provenance.editedByName}` : "",
  ]
    .filter(Boolean)
    .join(" · ")

  /** Edits land milliseconds after creation — only call it an edit when the
   *  row was touched meaningfully later, or the log names another editor. */
  function recentEditIso(updatedIso, createdIso, logEditedIso) {
    if (!updatedIso) return null
    const updated = new Date(updatedIso).getTime()
    const created = createdIso ? new Date(createdIso).getTime() : updated
    const threshold = 60 * 1000
    if (updated - created > threshold) return updatedIso
    return logEditedIso && new Date(logEditedIso).getTime() - created > threshold
      ? logEditedIso
      : null
  }

  $: creatorFirstName = (provenance?.creatorName || "").trim().split(/\s+/)[0]
  $: creatorInitial = (creatorFirstName || "?").charAt(0).toUpperCase()
  $: vehicleComponent = provenance?.vehicleType
    ? vehicleComponents[provenance.vehicleType] || vehicleComponents.Pointer
    : null

  // ── Coords helpers ──

  function formatCoordinates(coordinates) {
    if (!coordinates || coordinates.length !== 2) return "N/A"
    const [lng, lat] = coordinates
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }

  async function copyCoordinates() {
    if (!marker?.coordinates) return
    try {
      await navigator.clipboard.writeText(formatCoordinates(marker.coordinates))
      copiedCoords = true
      clearTimeout(copiedCoordsTimer)
      copiedCoordsTimer = setTimeout(() => (copiedCoords = false), 1200)
      toast.success("Copied coordinates to clipboard")
    } catch (error) {
      console.error("Failed to copy coordinates:", error)
      toast.error("Couldn't copy coordinates")
    }
  }

  // ── Photos ──
  function dataUrlToBlob(dataUrl) {
    const [meta, base64] = dataUrl.split(",")
    const mime = meta.match(/data:(.*?);/)?.[1] || "image/jpeg"
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }

  function isPhotoCancelled(error) {
    return /cancel/i.test(error?.message || "")
  }

  async function loadPhotos() {
    if (!marker?.id) return
    photosLoading = true
    const res = await markerPhotoApi.getPhotos(marker.id)
    if (res.success) {
      photos = res.photos || []
    }
    photosLoading = false
  }

  // Keep the marker's photo metadata (paths, not expiring URLs) in the
  // confirmed-marker store so MapStateSaver preserves them on sync.
  function updateConfirmedMarkerPhotos(meta) {
    confirmedMarkersStore.update((markers) =>
      markers.map((m) => (m.id === marker?.id ? { ...m, photos: meta } : m)),
    )
  }

  function photoMetaOnly(list) {
    return (list || []).map(({ id, path, created_at }) => ({
      id,
      path,
      created_at,
    }))
  }

  async function takePhoto() {
    photoUploading = true
    try {
      // Phones: the native Prompt action sheet lets the user pick between
      // camera and gallery. Web/desktop: go straight to the file picker.
      const source = Capacitor.isNativePlatform()
        ? CameraSource.Prompt
        : CameraSource.Photos
      const photo = await CameraPlugin.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source,
        webUseInput: true,
      })
      if (!photo?.dataUrl) return false

      const blob = dataUrlToBlob(photo.dataUrl)
      const res = await markerPhotoApi.addPhoto(marker.id, blob)
      if (res.success && res.photo) {
        const withUrl = await markerPhotoApi.getSignedUrls([res.photo])
        photos = [...photos, ...withUrl]
        updateConfirmedMarkerPhotos(photoMetaOnly(photos))
        toast.success("Photo added")
        return true
      }
      toast.error(res.message || "Failed to save photo")
      return false
    } catch (error) {
      if (isPhotoCancelled(error)) return false
      console.error("Photo capture failed:", error)
      toast.error("Couldn't take photo")
      return false
    } finally {
      photoUploading = false
    }
  }

  async function deletePhoto(photo, event) {
    if (blockForViewer(event, isViewer)) return
    const res = await markerPhotoApi.deletePhoto(marker.id, photo)
    if (res.success) {
      photos = photos.filter((p) => p.id !== photo.id)
      if (viewingPhoto?.id === photo.id) viewingPhoto = null
      updateConfirmedMarkerPhotos(photoMetaOnly(photos))
      toast.success("Photo deleted")
    } else {
      toast.error(res.message || "Failed to delete photo")
    }
  }

  // ── Photo viewer (PhotoSwipe full-screen lightbox) ──
  function openPhoto(p) {
    viewingPhoto = p
  }

  // Start drawing from the main-view quick tiles (same flow as the panel).
  function startDrawing(mode) {
    if (!marker) return
    const iconClass = getCurrentIconClass(marker.id)
    const def = findMarkerByIconClass(iconClass)
    markerDrawingStore.startDrawing(
      marker.id,
      $profileStore.master_map_id,
      mode,
      $markerDrawingStore.color,
      def?.name || "Marker",
    )
    handleDrawingStart()
  }

  // ── Drawing flow (hide the panel while drawing, reopen after) ──
  function handleDrawingStart() {
    shouldReopenAfterDrawing = true
    previousMarkerId = marker?.id
    panelOpen = false
  }

  // Close the footer "+ Add" dropdown when tapping anywhere outside it.
  function closeAddMenuOnOutside(e) {
    if (
      addMenuOpen &&
      !e.target?.closest?.(".mp-action-btn.open") &&
      !e.target?.closest?.(".mp-add-menu")
    ) {
      addMenuOpen = false
    }
  }

  // Run an action picked from the footer "+ Add" menu, then close it.
  function runAddAction(action) {
    addMenuOpen = false
    action()
  }

  function handleDrawingFlowComplete(event) {
    if (
      shouldReopenAfterDrawing &&
      previousMarkerId === event.detail?.markerId
    ) {
      shouldReopenAfterDrawing = false
      previousMarkerId = null
      setTimeout(() => {
        panelOpen = true
        view = "main"
        setTimeout(() => drawingPanelRef?.refreshDrawings(), 150)
      }, 100)
    }
  }

  // ── Move mode (drag the marker icon, like the silo) ──
  function toggleMove(event) {
    if (!moving && blockForViewer(event, isViewer)) return
    if (!map) return
    moving = !moving
    dragging = false
    liveCoords = null
    dragTargetX = null
    dragTargetY = null
    if (dragRafId != null) {
      cancelAnimationFrame(dragRafId)
      dragRafId = null
    }
    confirmDelete = false
    originalCoords = moving && marker ? [...marker.coordinates] : null
    const container = map.getContainer()
    if (moving) {
      mapInteractionsSuppressed.set(true)
      container.addEventListener("mousedown", onCanvasDragStart, true)
      container.addEventListener("touchstart", onCanvasDragStart, {
        capture: true,
        passive: false,
      })
      window.addEventListener("mousemove", onDragMove)
      window.addEventListener("touchmove", onDragMove, { passive: false })
      window.addEventListener("mouseup", onDragEnd)
      window.addEventListener("touchend", onDragEnd)
    } else {
      mapInteractionsSuppressed.set(false)
      clearAttention()
      container.removeEventListener("mousedown", onCanvasDragStart, true)
      container.removeEventListener("touchstart", onCanvasDragStart, true)
      window.removeEventListener("mousemove", onDragMove)
      window.removeEventListener("touchmove", onDragMove)
      window.removeEventListener("mouseup", onDragEnd)
      window.removeEventListener("touchend", onDragEnd)
    }
  }

  // Press on the marker icon (within its hit square) → drag the marker. The
  // capture phase stops mapbox from starting a pan for that press.
  function onCanvasDragStart(e) {
    if (!marker || !isWithinIconArea(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragging = true
  }

  function onPanelDragStart(e) {
    if (!moving) return
    if (e.target.closest("button, select, input, textarea, label")) return
    e.preventDefault()
    dragging = true
  }

  function isWithinIconArea(e) {
    if (!map || !marker?.coordinates) return false
    const rect = map.getContainer().getBoundingClientRect()
    const p = map.project(marker.coordinates)
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    if (clientX == null || clientY == null) return false
    return (
      Math.abs(clientX - rect.left - p.x) <= ICON_DRAG_HALF &&
      Math.abs(clientY - rect.top - p.y) <= ICON_DRAG_HALF
    )
  }

  function updateAttention() {
    if (moving && marker && offscreen) {
      mapAttentionStore.add({
        id: `marker-move-${marker.id}`,
        coordinates: liveCoords || marker.coordinates,
        icon: Move,
        color: "#f59e0b",
        label: markerName,
      })
      attentionActive = true
    } else if (attentionActive) {
      mapAttentionStore.remove(`marker-move-${marker?.id}`)
      attentionActive = false
    }
  }

  function clearAttention() {
    if (attentionActive) {
      mapAttentionStore.remove(`marker-move-${marker?.id}`)
      attentionActive = false
    }
    if (drawingFocusActive) {
      mapAttentionStore.remove(`marker-focus-${marker?.id}`)
      drawingFocusActive = false
    }
  }

  // While the panel is focused on a drawing, register an edge badge that
  // points at the (off-screen) host marker. Clicking it jumps back to the
  // marker and re-focuses the panel there.
  function updateDrawingFocusAttention() {
    if (!drawingAnchor || moving || !marker?.coordinates || !map) {
      if (drawingFocusActive) {
        mapAttentionStore.remove(`marker-focus-${marker?.id}`)
        drawingFocusActive = false
      }
      return
    }
    try {
      const rect = map.getContainer().getBoundingClientRect()
      const p = map.project(marker.coordinates)
      const off =
        p.x < -4 || p.x > rect.width + 4 || p.y < -4 || p.y > rect.height + 4
      if (off) {
        mapAttentionStore.add({
          id: `marker-focus-${marker.id}`,
          coordinates: marker.coordinates,
          icon: MapPin,
          color: "#60a5fa",
          label: markerName,
          onClick: returnToMarker,
        })
        drawingFocusActive = true
      } else if (drawingFocusActive) {
        mapAttentionStore.remove(`marker-focus-${marker?.id}`)
        drawingFocusActive = false
      }
    } catch {
      // ignore
    }
  }

  function onDragMove(e) {
    if (!dragging || !marker) return
    const container = map.getContainer()
    const rect = container.getBoundingClientRect()
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    if (clientX == null || clientY == null) return
    // Target = the cursor's position (screen px); the rAF loop eases the
    // marker toward it so it glides instead of teleporting.
    dragTargetX = clientX - rect.left
    dragTargetY = clientY - rect.top
    startDragLoop()
  }

  // Frame-rate-independent exponential ease toward the drag target.
  function startDragLoop() {
    if (dragRafId != null) return
    lastDragFrame = performance.now()
    const tick = (now) => {
      dragRafId = null
      if (
        !dragging ||
        !map ||
        !marker ||
        dragTargetX == null ||
        dragTargetY == null
      ) {
        return
      }
      const dt = Math.min(50, now - lastDragFrame)
      lastDragFrame = now
      const alpha = 1 - Math.pow(1 - LERP_FACTOR, dt / 16.7)
      const from = liveCoords || marker.coordinates
      const cur = map.project(from)
      const nx = cur.x + (dragTargetX - cur.x) * alpha
      const ny = cur.y + (dragTargetY - cur.y) * alpha
      const settled = Math.hypot(dragTargetX - nx, dragTargetY - ny) < 0.5
      const ll = map.unproject(settled ? [dragTargetX, dragTargetY] : [nx, ny])
      liveCoords = [ll.lng, ll.lat]
      moveSiloLive(marker.id, liveCoords)
      position()
      if (!settled) dragRafId = requestAnimationFrame(tick)
    }
    dragRafId = requestAnimationFrame(tick)
  }

  function onDragEnd() {
    if (!dragging) return
    dragging = false
  }

  function placeMarker() {
    if (!marker) return
    if (liveCoords) {
      commitSiloMove(marker.id, liveCoords)
      showMoveRipple(liveCoords, markerName)
    }
    toggleMove()
    deselectMarker()
  }

  // ── Close (X): cancels a move + reverts icon preview, then closes ──
  function handleClose() {
    colorBoxOpen = false
    if (pendingIconChange) {
      revertIconChange()
      resetIconEdit()
    }
    if (moving) {
      if (marker && originalCoords) {
        moveSiloLive(marker.id, originalCoords)
      }
      liveCoords = null
      toggleMove()
    }
    deselectMarker()
  }

  // ── Delete (header trash — tap once to arm, tap again to confirm) ──
  function armDelete(event) {
    if (blockForViewer(event, isViewer)) return
    confirmDelete = true
    clearTimeout(confirmDeleteTimer)
    confirmDeleteTimer = setTimeout(() => (confirmDelete = false), 2500)
  }

  function doDelete(event) {
    if (blockForViewer(event, isViewer)) return
    confirmDelete = false
    clearTimeout(confirmDeleteTimer)
    removeMarker()
  }

  function handleDrawingSelected(event) {
    const detail = event.detail || {}
    // Selected → anchor the panel above the drawing; deselected → back to marker.
    drawingAnchor = detail.drawingId ? detail.bounds || null : null
    position()
  }

  // Return focus to the host marker: deselect the drawing, move the panel
  // back to the marker and place the marker in the lower portion of the
  // screen (like the drawing fit) so the panel renders fully above it.
  function returnToMarker() {
    if (!marker?.coordinates || !map) return
    drawingPanelRef?.deselectDrawing()
    drawingAnchor = null
    // IMPORTANT: measure the container in CSS pixels. map.project/unproject
    // work in CSS pixels, but map.getCanvas().width/height are the WebGL
    // backing-store size (multiplied by devicePixelRatio) — mixing the two
    // throws the marker off-screen on HiDPI/200%-scale displays.
    const container = map.getContainer()
    const W = container.clientWidth
    const H = container.clientHeight
    const panelH = markerPopEl?.offsetHeight || 360
    const targetY = Math.min(panelH + 64, H - 80)
    const p = map.project(marker.coordinates)
    const center = map.unproject([p.x, p.y + H / 2 - targetY])
    map.easeTo({ center, duration: 600 })
    position()
  }

  function handleHeaderClick(event) {
    if (event.target.closest("button")) return
    returnToMarker()
  }

  // Reposition with a short slide transition (used on flips); plain
  // position() stays instant so the menu follows the map.
  function positionSmooth() {
    if (moving) {
      position()
      return
    }
    smoothReposition = true
    position()
    clearTimeout(smoothRepositionTimer)
    smoothRepositionTimer = setTimeout(() => (smoothReposition = false), 350)
  }

  onMount(() => {
    position()
    lastMenuHeight = markerPopEl?.offsetHeight || 0
    // Re-position whenever the panel's size changes so the flip/slide
    // decision is recomputed at the exact moment it grows.
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        const h = markerPopEl?.offsetHeight || 0
        if (h && Math.abs(h - lastMenuHeight) > 2) {
          lastMenuHeight = h
          positionSmooth()
        } else if (h) {
          lastMenuHeight = h
        }
      })
      if (markerPopEl) resizeObserver.observe(markerPopEl)
    }
    window.addEventListener(
      "marker-drawing-flow-complete",
      handleDrawingFlowComplete,
    )
    window.addEventListener("marker-drawing-selected", handleDrawingSelected)
    // Close the footer "+ Add" dropdown when tapping anywhere else.
    window.addEventListener("pointerdown", closeAddMenuOnOutside)
    if (!map) return
    map.on("move", position)
    map.on("zoom", position)
    map.on("rotate", position)
    map.on("pitch", position)
    map.on("resize", position)
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    clearTimeout(smoothRepositionTimer)
    clearAttention()
    if (dragRafId != null) {
      cancelAnimationFrame(dragRafId)
      dragRafId = null
    }
    window.removeEventListener(
      "marker-drawing-flow-complete",
      handleDrawingFlowComplete,
    )
    window.removeEventListener("marker-drawing-selected", handleDrawingSelected)
    window.removeEventListener("pointerdown", closeAddMenuOnOutside)
    if (pendingIconChange) {
      revertIconChange()
    }
    if (!map) return
    map.off("move", position)
    map.off("zoom", position)
    map.off("rotate", position)
    map.off("pitch", position)
    map.off("resize", position)
    if (moving) {
      mapInteractionsSuppressed.set(false)
      const container = map.getContainer?.()
      container?.removeEventListener("mousedown", onCanvasDragStart, true)
      container?.removeEventListener("touchstart", onCanvasDragStart, true)
      window.removeEventListener("mousemove", onDragMove)
      window.removeEventListener("touchmove", onDragMove)
      window.removeEventListener("mouseup", onDragEnd)
      window.removeEventListener("touchend", onDragEnd)
    }
  })

  $: if (marker) position()
</script>

{#if panelOpen && marker}
  {#key marker.id}
    <div
      class="marker-pop"
      class:moving
      class:dragging
      class:hidden={!visible || hideForEditor}
      class:down={!openUp}
      class:smooth={smoothReposition}
      on:mousedown={onPanelDragStart}
      on:touchstart={onPanelDragStart}
      style="left:{left}px; top:{top}px;"
      bind:this={markerPopEl}
    >
      <div class="marker-pop-head" on:click={handleHeaderClick}>
        <!-- Real map preview: same renderer MarkerManager uses, so the thumb
             shows the marker's own tint style (circle-fill-black by default)
             and colour. -->
        <div
          class="marker-pop-icon"
          title={`Marker colour: ${headerColorDef.label}`}
        >
          <TintedIconPreview
            icon={headerIconDef}
            colorKey={markerColorKey}
            size={30}
          />
        </div>
        <div class="marker-pop-titles">
          <div class="marker-pop-title-row">
            <span class="marker-pop-title" title={markerName}>{markerName}</span
            >
          </div>
          <div class="marker-pop-meta">
            {#if provenance?.creatorName}
              <span
                class="mp-meta-chip"
                title={`Placed by ${provenance.creatorName}`}
              >
                <span class="mp-meta-avatar">{creatorInitial}</span>
                <span class="mp-meta-chip-name">{creatorFirstName}</span>
              </span>
            {/if}
            {#if vehicleComponent}
              <span
                class="mp-meta-vehicle"
                title={`Left by ${provenance.creatorName}${
                  provenance.vehicleType ? ` · ${provenance.vehicleType}` : ""
                }`}
              >
                <svelte:component
                  this={vehicleComponent}
                  bodyColor={provenance.vehicleColor || "yellow"}
                  size="15px"
                />
              </span>
            {/if}
            {#if dateLabel}
              <span class="mp-meta-date" title={dateTitle}>{dateLabel}</span>
            {/if}
          </div>
        </div>
        <button
          class="marker-pop-close"
          on:click={handleClose}
          aria-label="Close marker panel"
        >
          <X size={16} />
        </button>
      </div>

      {#if moving}
        <div class="marker-pop-move-body">
          <div class="marker-pop-hint">
            <Hand size={16} />
            <span>Click and drag to move</span>
          </div>
        </div>
        <button class="marker-pop-place" on:click={placeMarker}>
          <Check size={16} />
          <span>Place</span>
        </button>
      {:else if view === "icon"}
        <div class="mp-subhead">
          <button class="mp-back" on:click={goMain}>
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>
          <span class="mp-subhead-title">Icon</span>
          <!-- Colour sits in the sub-header as a compact pill beside Back, so
               the whole body is left to the icon grid. -->
          <div class="mp-color-anchor">
            <button
              type="button"
              class="mp-color-pill"
              class:open={colorBoxOpen}
              class:color-active={markerColorKey !== MARKER_COLOR_DEFAULT}
              title="Change the marker colour"
              aria-label={`Change colour — currently ${
                markerColorKey === MARKER_COLOR_DEFAULT
                  ? "Default"
                  : headerColorDef?.label
              }`}
              on:click={toggleColorBox}
            >
              <span
                class="mp-color-swatch"
                style="background: {styleSwatchBg(
                  markerColor(menuTriggerColorKey, markerStyle),
                  markerStyle,
                )};"
              ></span>
              <span class="mp-color-pill-label">
                {markerColorKey === MARKER_COLOR_DEFAULT
                  ? "Default"
                  : headerColorDef?.label}
              </span>
              <ChevronDown size={14} class="mp-color-chevron" />
            </button>
            {#if colorBoxOpen}
              <button
                type="button"
                class="mp-color-pop-overlay"
                aria-label="Close colour picker"
                on:click={() => (colorBoxOpen = false)}
              ></button>
              <div class="mp-color-pop">
                <button
                  type="button"
                  class="mp-color-cell mp-color-cell-special"
                  class:active={markerColorKey === MARKER_COLOR_DEFAULT}
                  title="Default — follows the marker default colour"
                  aria-label="Marker colour: Default"
                  on:click={() => pickMenuColor(MARKER_COLOR_DEFAULT)}
                  >D</button
                >
                {#each pickableColorsForStyle(markerStyle) as c}
                  <button
                    type="button"
                    class="mp-color-cell"
                    class:active={markerColorKey === c.key}
                    style="background: {styleSwatchBg(
                      markerColor(c.key, markerStyle),
                      markerStyle,
                    )};"
                    title={c.label}
                    aria-label={`Marker colour ${c.label}`}
                    on:click={() => pickMenuColor(c.key)}
                  ></button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="marker-pop-body">
          {#if makeDefaultVisible}
            <label
              class="mp-make-default-check"
              title="Save will also set this colour as the default for {markerName}"
            >
              <input type="checkbox" bind:checked={makeDefaultArmed} />
              <span>Make default</span>
            </label>
          {/if}
          <div class="mp-icon-grid">
            {#if specialMarkers.length}
              {#each specialMarkers as icon}
                <button
                  class="mp-icon-option mp-icon-option-special"
                  class:selected={getIsIconSelected(icon, selectedIconKey)}
                  on:click={() => previewIcon(icon)}
                  title={icon.name}
                >
                  {#if icon.id === "default"}
                    <IconSVG icon="mapbox-marker" size="22px" />
                  {:else if icon.class.startsWith("custom-svg")}
                    <IconSVG icon={icon.id} size="22px" />
                  {:else if icon.class.startsWith("ionic-")}
                    <ion-icon name={icon.id} style="font-size: 22px;"
                    ></ion-icon>
                  {:else}
                    <i class={`${icon.class} text-lg`}></i>
                  {/if}
                </button>
              {/each}
            {/if}
            {#each standardMarkers as icon}
              <button
                class="mp-icon-option"
                class:selected={getIsIconSelected(icon, selectedIconKey)}
                on:click={() => previewIcon(icon)}
                title={icon.name}
              >
                {#if icon.id === "default"}
                  <IconSVG icon="mapbox-marker" size="22px" />
                {:else if icon.class.startsWith("custom-svg")}
                  <IconSVG icon={icon.id} size="22px" />
                {:else if icon.class.startsWith("ionic-")}
                  <ion-icon name={icon.id} style="font-size: 22px;"></ion-icon>
                {:else}
                  <i class={`${icon.class} text-lg`}></i>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Always-open note field (mirrors the placement panel), pinned at
             the bottom of the menu (outside the scroll body) so it stays
             visible while editing. Saves on blur; Enter also confirms. -->
        <input
          type="text"
          class="mp-notes-input mp-notes-input-icon"
          bind:this={noteInputEl}
          bind:value={notesText}
          placeholder="Add a note..."
          maxlength="500"
          aria-label="Add a note"
          on:keydown={onNotesKeydown}
          on:blur={finishNoteEdit}
        />
      {:else}
        <div class="marker-pop-body">
          <div class="mp-main">
            {#if isGate}
              <div class="mp-section">
                <div
                  class="mp-state-toggle"
                  role="group"
                  aria-label="Gate state"
                >
                  <button
                    type="button"
                    class="mp-state-btn"
                    class:active={!marker?.gateOpen}
                    class:guest-disabled={isViewer}
                    on:click={(e) => setGateOpen(false, e)}
                    title="Mark this gate as closed"
                  >
                    <IconSVG icon="gate" size="20px" />
                    <span>Closed</span>
                  </button>
                  <button
                    type="button"
                    class="mp-state-btn"
                    class:active={marker?.gateOpen === true}
                    class:guest-disabled={isViewer}
                    on:click={(e) => setGateOpen(true, e)}
                    title="Mark this gate as open"
                  >
                    <IconSVG icon="gate_open" size="20px" />
                    <span>Open</span>
                  </button>
                </div>
              </div>
            {/if}
            {#if isRock}
              <div class="mp-section">
                <div
                  class="mp-state-toggle"
                  role="group"
                  aria-label="Rock picked state"
                >
                  <button
                    type="button"
                    class="mp-state-btn"
                    class:active={!marker?.rockPicked}
                    class:guest-disabled={isViewer}
                    on:click={(e) => setRockPicked(false, e)}
                    title="Rock still to be picked"
                  >
                    <IconSVG
                      icon={marker?.iconClass === "custom-svg-rock_pile"
                        ? "rock_pile"
                        : "rock"}
                      size="20px"
                    />
                    <span>Not picked</span>
                  </button>
                  <button
                    type="button"
                    class="mp-state-btn"
                    class:active={marker?.rockPicked === true}
                    class:guest-disabled={isViewer}
                    on:click={(e) => setRockPicked(true, e)}
                    title="Rock has been picked"
                  >
                    <Check size={18} />
                    <span>Picked</span>
                  </button>
                </div>
              </div>
            {/if}
            <div class="mp-section">
              <div class="mp-section-head">
                <span class="mp-section-title">
                  <FileText size={12} />
                  <span>Notes</span>
                </span>
                <label
                  class="mp-label-toggle"
                  class:guest-disabled={isViewer}
                  title="Show map label above marker"
                >
                  <span class="mp-label-toggle-text">Map Label</span>
                  <input
                    type="checkbox"
                    checked={noteLabelVisible}
                    on:change={(e) => {
                      if (blockForViewer(e, isViewer)) {
                        e.currentTarget.checked = noteLabelVisible
                        return
                      }
                      toggleNoteLabel(e.currentTarget.checked)
                    }}
                  />
                  <span class="mp-switch-track">
                    <span class="mp-switch-thumb"></span>
                  </span>
                </label>
              </div>
              {#if noteEditing}
                <textarea
                  bind:this={noteInputEl}
                  class="mp-notes-input"
                  rows="3"
                  maxlength="500"
                  placeholder="Add notes..."
                  bind:value={notesText}
                  on:keydown={onNotesKeydown}
                  on:blur={finishNoteEdit}
                ></textarea>
              {:else}
                <button
                  class="mp-note-card"
                  class:empty={!notesText}
                  class:guest-disabled={isViewer}
                  on:click={startNoteEdit}
                  title="Tap to edit note"
                >
                  <span class="mp-note-card-pencil" aria-hidden="true">
                    <Pencil size={11} />
                  </span>
                  <span class="mp-note-card-text">
                    {notesText || "Tap to add a note…"}
                  </span>
                  <span
                    class="mp-note-saved"
                    class:show={noteSavedFlash}
                    aria-hidden="true"
                  >
                    <Check size={11} />
                    <span>Saved</span>
                  </span>
                </button>
              {/if}
            </div>

            {#if photos.length > 0}
              <div class="mp-section">
                <div class="mp-section-head">
                  <span class="mp-section-title">
                    <Camera size={12} />
                    <span>Photos ({photos.length})</span>
                  </span>
                  {#if photosLoading}
                    <span class="mp-photos-loading">…</span>
                  {/if}
                </div>
                <div class="mp-photo-grid">
                  {#each photos as p}
                    <div
                      class="mp-photo-thumb"
                      style="background-image:url({p.url});"
                      title="View photo"
                      on:click={() => openPhoto(p)}
                    >
                      <button
                        class="mp-photo-delete"
                        class:guest-disabled={isViewer}
                        on:click|stopPropagation={(e) => deletePhoto(p, e)}
                        title="Delete photo"
                        aria-label="Delete photo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="mp-draw-wrap">
              <DrawingPanel
                bind:this={drawingPanelRef}
                {map}
                currentMarker={marker}
                {getCurrentIconClass}
                onStartDrawing={handleDrawingStart}
                showDrawButtons={false}
                hideWhenEmpty
                onEditStart={() => (hideForEditor = true)}
                onEditEnd={() => (hideForEditor = false)}
              />
            </div>
          </div>
        </div>

        <!-- Sticky delete bar — always visible above the footer, never buried
             at the end of the scrolling body. -->
        <div class="mp-delete-row">
          <button
            class="mp-delete-btn"
            class:armed={confirmDelete}
            class:guest-disabled={isViewer}
            on:click={confirmDelete ? doDelete : armDelete}
            title={confirmDelete ? "Tap again to confirm" : "Delete marker"}
          >
            {#if confirmDelete}
              <Check size={18} />
              <span>Tap again to delete</span>
            {:else}
              <Trash2 size={18} />
              <span>Delete marker</span>
            {/if}
          </button>
        </div>

        <div class="mp-footer-row">
          <button
            class="mp-action-btn"
            class:guest-disabled={isViewer}
            on:click={(e) => {
              if (blockForViewer(e, isViewer)) return
              view = "icon"
            }}
            title="Edit marker icon"
          >
            <span class="mp-action-glyph">
              {#if displayIconClass === "default"}
                <IconSVG icon="mapbox-marker" size="16px" />
              {:else if displayIconClass?.startsWith("custom-svg")}
                <IconSVG
                  icon={displayIconClass?.replace("custom-svg-", "")}
                  size="16px"
                />
              {:else if displayIconClass?.startsWith("ionic-")}
                <ion-icon
                  name={displayIconClass?.replace("ionic-", "")}
                  style="font-size: 16px;"
                ></ion-icon>
              {:else}
                <i
                  class={`${displayIconClass}`}
                  style="font-size: 16px; line-height: 1;"
                ></i>
              {/if}
            </span>
            <span>Edit</span>
          </button>
          <button
            class="mp-action-btn accent"
            class:guest-disabled={isViewer}
            on:click={toggleMove}
          >
            <span class="mp-action-glyph">
              <Move size={16} />
            </span>
            <span>Move</span>
          </button>
          <button
            class="mp-action-btn"
            class:open={addMenuOpen}
            class:guest-disabled={isViewer}
            on:click={(e) => {
              if (blockForViewer(e, isViewer)) return
              addMenuOpen = !addMenuOpen
            }}
            title="Add photo or drawing"
            aria-label="Add photo or drawing"
          >
            <span class="mp-action-glyph">
              <Plus size={16} />
            </span>
            <span>Add</span>
          </button>
          {#if addMenuOpen}
            <div class="mp-add-menu" role="menu" aria-label="Add options">
              <button
                class="mp-add-menu-item"
                on:click={() => runAddAction(takePhoto)}
                disabled={photoUploading}
              >
                <Camera size={15} />
                <span>Photo</span>
              </button>
              <button
                class="mp-add-menu-item"
                on:click={() => runAddAction(() => startDrawing("area"))}
              >
                <Square size={15} />
                <span>Draw area</span>
              </button>
              <button
                class="mp-add-menu-item"
                on:click={() => runAddAction(() => startDrawing("line"))}
              >
                <Spline size={15} />
                <span>Draw line</span>
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#if !moving && hasChanges}
        <button class="mp-update-btn" on:click={confirmIcon}>
          <Check size={14} />
          <span>Update marker</span>
        </button>
      {/if}
    </div>
  {/key}
{/if}

{#if moving && originalCoords}
  <div
    class="marker-origin"
    class:moved={movedFromOrigin}
    style="left:{originX}px; top:{originY}px;"
    aria-hidden="true"
  ></div>
{/if}

{#if viewingPhoto}
  <PhotoLightbox
    {photos}
    index={viewerIndex}
    on:close={() => {
      viewingPhoto = null
    }}
  />
{/if}

<style>
  /* FIXED panel height → consistent size across every view. */
  .marker-pop {
    --pop-y: -100%;
    position: fixed;
    transform: translate(-50%, var(--pop-y));
    width: 280px;
    height: 400px;
    max-height: calc(100vh - 70px);
    z-index: 1001;
    animation: mp-pop-in 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    background: rgba(8, 12, 24, 0.97);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(96, 165, 250, 0.4);
    border-radius: 14px;
    padding: 10px 12px 12px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: rgba(255, 255, 255, 0.92);
  }
  /* Near the top of the screen the menu flips to open downward. */
  .marker-pop.down {
    --pop-y: 0%;
  }
  /* Smooth slide/flip when repositioning after a flip — disabled during
     normal map tracking. */
  .marker-pop.smooth {
    transition:
      transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      top 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .marker-pop.hidden {
    opacity: 0;
    pointer-events: none;
  }
  .marker-pop.moving {
    border-style: dashed;
    border-width: 2px;
    border-color: rgba(245, 158, 11, 0.9);
    cursor: grab;
    user-select: none;
  }
  /* Dim the menu while actively dragging so you can see what's behind it. */
  .marker-pop.dragging {
    opacity: 0.55;
  }
  /* Entrance pop-in — also covers the near-instant drawings load so the
     section appears without any visible layout adjustment. */
  @keyframes mp-pop-in {
    from {
      opacity: 0;
      transform: translate(-50%, var(--pop-y)) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translate(-50%, var(--pop-y)) scale(1);
    }
  }
  .marker-pop.moving:active {
    cursor: grabbing;
  }

  .marker-pop-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 8px;
  }
  .marker-pop-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
  }
  .marker-pop-titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .marker-pop-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .marker-pop-title {
    min-width: 0;
    font-size: 13px;
    font-weight: 800;
    color: #93c5fd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Compact provenance line: [who] [machine] · when. Kept on one line so the
     header never grows taller than the icon it sits beside. */
  .marker-pop-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    font-size: 9px;
    font-weight: 600;
    line-height: 1.2;
    color: rgba(255, 255, 255, 0.45);
  }
  .mp-meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 1;
    min-width: 0;
    padding: 1px 5px 1px 1px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.75);
  }
  .mp-meta-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    border-radius: 50%;
    background: rgba(96, 165, 250, 0.28);
    color: #dbeafe;
    font-size: 8px;
    font-weight: 800;
  }
  .mp-meta-chip-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 52px;
  }
  .mp-meta-vehicle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    flex-shrink: 0;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.08);
    padding: 1px;
  }
  .mp-meta-vehicle :global(svg) {
    width: 100% !important;
    height: 100% !important;
  }
  .mp-meta-date {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .marker-pop-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: none;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    flex-shrink: 0;
  }
  .marker-pop-close:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }

  /* Drill-in sub-headers (Icon / Draw views) */
  .mp-subhead {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    min-height: 32px;
  }
  .mp-back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 32px;
    padding: 0 10px 0 4px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .mp-back:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .mp-subhead-title {
    flex: 1;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.6);
  }
  /* Body fills the remaining fixed panel height, scrolls when needed.
     Bottom padding keeps the last item's border from being clipped by the
     scroll viewport edge when the content overflows. overflow-x is clipped
     so nothing in the menu ever needs horizontal scrolling. */
  .marker-pop-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 8px;
    /* Visible scrollbar: desktop and Android WebView render this track/thumb
       permanently, so "there's more below" is obvious without scrolling. */
    scrollbar-width: thin;
    scrollbar-color: rgba(147, 197, 253, 0.6) rgba(255, 255, 255, 0.07);
  }
  .marker-pop-body::-webkit-scrollbar {
    width: 9px;
  }
  .marker-pop-body::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.07);
    border-radius: 8px;
  }
  .marker-pop-body::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 8px;
    background: rgba(147, 197, 253, 0.55);
    background-clip: padding-box;
  }
  .marker-pop-body::-webkit-scrollbar-thumb:hover {
    background: rgba(191, 219, 254, 0.85);
    background-clip: padding-box;
  }
  .mp-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mp-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .mp-section-title {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.55);
  }

  /* Special-state segmented toggle (gate open/closed, rock picked). */
  .mp-state-toggle {
    display: flex;
    gap: 6px;
  }
  .mp-state-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    padding: 6px 8px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.75);
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .mp-state-btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .mp-state-btn.active {
    border-color: rgba(96, 165, 250, 0.8);
    background: rgba(96, 165, 250, 0.18);
    color: #bfdbfe;
    box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4);
  }

  .mp-notes-input {
    width: 100%;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    outline: none;
  }
  .mp-notes-input:focus {
    border-color: rgba(96, 165, 250, 0.7);
  }

  /* Official note card — the collapsed, read-only display of the note.
     Left accent border + pencil affordance read like a memo/record. */
  .mp-note-card {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
    padding: 9px 11px 10px 12px;
    border-radius: 9px;
    border: 1px solid rgba(96, 165, 250, 0.26);
    border-left: 3px solid rgba(96, 165, 250, 0.65);
    background: linear-gradient(
      180deg,
      rgba(96, 165, 250, 0.09),
      rgba(96, 165, 250, 0.04)
    );
    color: rgba(255, 255, 255, 0.88);
    text-align: left;
    cursor: text;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }
  .mp-note-card:hover {
    border-color: rgba(96, 165, 250, 0.45);
    background: linear-gradient(
      180deg,
      rgba(96, 165, 250, 0.14),
      rgba(96, 165, 250, 0.07)
    );
  }
  .mp-note-card-pencil {
    position: absolute;
    top: 50%;
    right: 9px;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(147, 197, 253, 0.7);
    pointer-events: none;
  }
  .mp-note-card-text {
    min-width: 0;
    padding-right: 14px; /* keep text clear of the pencil */
    font-size: 12.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .mp-note-card.empty .mp-note-card-text {
    color: rgba(255, 255, 255, 0.35);
    font-style: italic;
  }

  /* Brief "✓ Saved" chip that pops over the card after confirming.
     Kept inside the card's right edge so it never causes horizontal
     overflow in the scroll body. */
  .mp-note-saved {
    position: absolute;
    top: -7px;
    right: 2px;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(34, 197, 94, 0.95);
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    opacity: 0;
    transform: translateY(3px);
    pointer-events: none;
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
    z-index: 2;
  }
  .mp-note-saved.show {
    opacity: 1;
    transform: translateY(0);
  }

  .mp-label-toggle {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    user-select: none;
  }
  .mp-label-toggle-text {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
  }
  .mp-label-toggle input {
    display: none;
  }
  .mp-switch-track {
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    position: relative;
    transition: background 0.15s ease;
  }
  .mp-label-toggle input:checked + .mp-switch-track {
    background: rgba(96, 165, 250, 0.8);
  }
  .mp-switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.15s ease;
  }
  .mp-label-toggle input:checked + .mp-switch-track .mp-switch-thumb {
    left: 16px;
  }

  /* Compact full-width confirm button pinned at the bottom of the edit menu
     (mirrors the placement menu's confirm). Shows whenever the marker has
     pending changes: icon/colour preview or an unsaved note. */
  .mp-update-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    flex-shrink: 0;
    padding: 9px 10px;
    border-radius: 8px;
    border: 1px solid rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .mp-update-btn:hover {
    background: rgba(245, 158, 11, 0.28);
  }

  /* Footer row: Icon + Move squares, with a Coords/Delete stacked column */
  .mp-footer-row {
    display: flex;
    gap: 6px;
    height: 52px;
    flex-shrink: 0;
    position: relative;
  }
  .mp-action-btn.open {
    background: rgba(96, 165, 250, 0.32);
    border-color: rgba(147, 197, 253, 0.75);
  }
  .mp-add-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    display: flex;
    flex-direction: column;
    min-width: 132px;
    padding: 5px;
    gap: 2px;
    border-radius: 10px;
    border: 1px solid rgba(96, 165, 250, 0.45);
    background: rgba(10, 16, 30, 0.98);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
    z-index: 10;
  }
  .mp-add-menu-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .mp-add-menu-item:hover {
    background: rgba(96, 165, 250, 0.18);
  }
  .mp-add-menu-item:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Delete marker — pinned above the footer, high contrast so it reads in
     sunlight. Two-step (arm → confirm) so it can't fire by accident. */
  .mp-delete-row {
    display: flex;
    flex-shrink: 0;
  }
  /* Colour swatch — always shows the colour the marker will actually render
     with (including the resolved default), so the control never looks empty. */
  .mp-color-swatch {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.75);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
  }
  .mp-color-pop-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    border: none;
    background: transparent;
    padding: 0;
    cursor: default;
  }
  .mp-color-pop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 31;
    width: 112px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 8px;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  .mp-color-cell {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s ease;
  }
  .mp-color-cell:hover {
    transform: scale(1.12);
  }
  .mp-color-cell.active {
    /* White ring on the picked colour. */
    border-color: #fff !important;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.6);
  }
  /* "Default" cell — dashed rim with a glyph */
  .mp-color-cell-special {
    border: 2px dashed rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
  }
  .mp-color-cell-special.active {
    border-style: solid;
    border-color: #fff;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.6);
  }
  .mp-delete-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 46px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(248, 113, 113, 0.75);
    background: rgba(239, 68, 68, 0.18);
    color: #fecaca;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.01em;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.06s ease;
  }
  .mp-delete-btn:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(252, 165, 165, 0.95);
    color: #fff;
  }
  .mp-delete-btn:active {
    transform: scale(0.99);
  }
  .mp-delete-btn.armed {
    background: #dc2626;
    color: #fff;
    border-color: #fecaca;
    box-shadow: 0 0 0 2px rgba(254, 202, 202, 0.35);
  }
  .mp-action-btn {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 48px;
    padding: 6px 4px;
    border-radius: 9px;
    border: 1px solid rgba(96, 165, 250, 0.4);
    background: rgba(96, 165, 250, 0.12);
    color: #bfdbfe;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .mp-action-glyph {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 0;
  }
  .mp-action-btn:hover {
    background: rgba(96, 165, 250, 0.26);
  }
  .mp-action-btn.accent {
    border-color: rgba(245, 158, 11, 0.55);
    background: rgba(245, 158, 11, 0.14);
    color: #fcd34d;
  }
  .mp-action-btn.accent:hover {
    background: rgba(245, 158, 11, 0.28);
  }

  /* Main view content stack */
  .mp-main {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* Quick-add: three equal square tiles (photo / draw area / draw line) */
  .mp-add-grid {
    display: flex;
    gap: 6px;
  }
  .mp-add-tile {
    flex: 1;
    height: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border-radius: 9px;
    border: 1px dashed rgba(96, 165, 250, 0.5);
    background: rgba(96, 165, 250, 0.06);
    color: rgba(147, 197, 253, 0.85);
    font-size: 9px;
    font-weight: 700;
    cursor: pointer;
  }
  .mp-add-tile:hover {
    background: rgba(96, 165, 250, 0.16);
  }

  /* Photos preview (shown when photos exist — not implemented yet) */
  .mp-photo-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .mp-photo-thumb {
    position: relative;
    height: 60px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.05);
    background-size: cover;
    background-position: center;
    cursor: zoom-in;
  }
  .mp-photo-delete {
    position: absolute;
    top: 3px;
    right: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.7);
    color: #fca5a5;
    cursor: pointer;
  }
  .mp-photo-delete:hover {
    background: rgba(239, 68, 68, 0.9);
    color: #fff;
  }
  .mp-photos-loading {
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
  }

  /* Photo tile saving state */
  .mp-photo-saving {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: rgba(147, 197, 253, 0.8);
    font-size: 9px;
    font-weight: 700;
  }
  .mp-photo-spin {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid rgba(96, 165, 250, 0.3);
    border-top-color: rgba(96, 165, 250, 0.9);
    animation: mp-spin 0.8s linear infinite;
  }
  @keyframes mp-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .mp-add-tile:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Single compact grid — special icons come first and stand out via an
     amber accent (border, tint, amber name + corner dot) instead of a
     divider. 5 per row — the wider (280px) menu gives the tiles room to be
     bigger than the original 250px layout. */
  .mp-icon-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  /* Special icons: a small overlaying amber dot badge in the corner — the
     tile itself stays normal-sized (no extra height, no colouring). The
     name shows on hover via the button's title. */
  .mp-icon-option.mp-icon-option-special {
    position: relative;
    border-color: rgba(245, 158, 11, 0.35);
  }
  .mp-icon-option.mp-icon-option-special::after {
    content: "";
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(245, 158, 11, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.25);
  }
  .mp-icon-option {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 46px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .mp-icon-option:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .mp-icon-option.selected {
    border-color: rgba(96, 165, 250, 0.8);
    background: rgba(96, 165, 250, 0.18);
    box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4);
  }

  /* Colour pill — a compact control sized to match the Back button it sits
     beside, so it reads as one of the sub-header's buttons instead of a
     full-width card stealing space from the icon grid. */
  .mp-color-anchor {
    position: relative;
    display: flex;
    flex-shrink: 0;
  }
  .mp-color-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 8px 0 5px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }
  .mp-color-pill:hover {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(96, 165, 250, 0.45);
  }
  /* A colour is picked → clear highlight around the control. */
  .mp-color-pill.color-active {
    border-color: rgba(96, 165, 250, 0.7);
    box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.3);
  }
  .mp-color-pill.open {
    background: rgba(96, 165, 250, 0.18);
    border-color: rgba(147, 197, 253, 0.85);
  }
  .mp-color-pill-label {
    max-width: 54px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mp-color-chevron {
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.65);
  }

  /* "Make default" checkbox — appears right after a non-default colour is
     picked, above the grid. Checking it arms the action; Save then also sets
     the colour as the marker type's default. */
  .mp-make-default-check {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 5px;
    margin-bottom: 8px;
    flex-shrink: 0;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 10px;
    font-weight: 600;
    transition: color 0.15s ease;
  }
  .mp-make-default-check:hover {
    color: #93c5fd;
  }
  .mp-make-default-check input {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: #34d399;
    cursor: pointer;
  }

  /* Single-line note field inside the icon edit view. */
  .mp-notes-input-icon {
    resize: none;
    margin-top: 10px;
  }

  /* DrawingPanel lives in the old bottom-bar's CSS: its .drawing-section is
     opacity:0 until inside a .marker-panel.expanded ancestor. Our wrapper
     forces it visible and lets it size to this panel's body. */
  :global(.mp-draw-wrap .drawing-section) {
    min-height: 0 !important;
    max-height: none !important;
    opacity: 1 !important;
    transform: none !important;
    padding: 0 4px 0 0 !important;
    overflow-y: auto;
    background: transparent !important;
  }

  /* Move mode */
  .marker-pop-move-body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .marker-pop-hint {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px dashed rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.08);
    border-radius: 10px;
    color: #fbbf24;
    font-size: 12px;
    font-weight: 700;
  }
  .marker-pop-place {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 11px;
    border-radius: 9px;
    border: none;
    background: #fbbf24;
    color: #0f172a;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .marker-pop-place:hover {
    background: #fcd34d;
  }

  .marker-origin {
    position: fixed;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px dashed rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.08);
    pointer-events: none;
    z-index: 1001;
    transition:
      background 0.2s ease,
      border-color 0.2s ease;
  }
  .marker-origin.moved {
    background: rgba(0, 0, 0, 0.55);
    border-color: rgba(255, 255, 255, 0.75);
    box-shadow:
      inset 0 0 0 2px rgba(0, 0, 0, 0.35),
      0 0 0 5px rgba(0, 0, 0, 0.18);
  }
</style>
