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
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    getAllMarkers,
    findMarkerByIconClass,
  } from "$lib/data/markerDefinitions"
  import { mapInteractionsSuppressed } from "$lib/stores/controlStore"
  import { mapAttentionStore } from "$lib/stores/mapAttentionStore"
  import DrawingPanel from "$lib/components/map/overlays/DrawingPanel.svelte"
  import PhotoLightbox from "$lib/components/map/markers/PhotoLightbox.svelte"

  export let map
  export let marker
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
  // True while the menu opens upward; flips to downward near the top of the
  // screen so the whole menu box stays on screen in every state.
  let openUp = true
  // When a drawing is selected, the panel anchors just above the drawing's
  // on-screen box instead of the marker. null = anchored to the marker.
  let drawingAnchor = null
  // The rendered panel element (used to measure its height for camera jumps).
  let markerPopEl = null
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
  $: displayIconClass = previewIconClass || getCurrentIconClass(marker?.id)

  const allMarkerIcons = getAllMarkers()
  $: selectableMarkers = allMarkerIcons.filter((m) => m.active)

  // Sync local state when the marker changes.
  $: {
    const id = marker?.id
    if (id !== lastMarkerId) {
      lastMarkerId = id
      notesText = marker?.notes || ""
      originalNotes = marker?.notes || ""
      noteLabelVisible = marker?.noteLabelVisible !== false
      noteEditing = false
      noteSavedFlash = false
      openUp = true
      confirmDelete = false
      addMenuOpen = false
      view = "main"
      panelOpen = true
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

      // Menu box dimensions (match the .marker-pop CSS).
      const menuW = 250
      const menuH = Math.min(360, rect.height - 70)

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
        // Vertically: open upward (menu sits above the marker) by default, but
        // flip to open downward when there isn't enough room above, so the
        // whole menu box stays on screen.
        openUp = py - 44 - menuH >= 8
        let anchorY = openUp ? py - 44 : py + 44
        if (openUp) {
          anchorY = Math.max(anchorY, menuH + 8)
          anchorY = Math.min(anchorY, rect.height - 8)
        } else {
          anchorY = Math.max(anchorY, 8)
          anchorY = Math.min(anchorY, rect.height - menuH - 8)
        }
        // Horizontally: keep the menu centered on the marker, but shift it so
        // the 250px box never leaves the screen edges.
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
    // Leaving the icon picker without saving discards the preview.
    if (pendingIconChange) {
      revertIconChange()
      resetIconEdit()
    }
    view = "main"
  }

  // ── Icon editing (preview live on the map, commit on save) ──
  function getIsIconSelected(icon) {
    if (selectedIconForEdit) {
      return (
        selectedIconForEdit.id === icon.id &&
        selectedIconForEdit.class === icon.class
      )
    }
    const current = getCurrentIconClass(marker?.id)
    if (!current || current === "default") {
      return icon.id === "default" && icon.class === "default"
    }
    if (current.startsWith("custom-svg-")) {
      return (
        icon.class === "custom-svg" &&
        icon.id === current.replace("custom-svg-", "")
      )
    }
    return icon.class === current
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
  }

  function confirmIcon() {
    if (!marker || !pendingIconChange || !selectedIconForEdit) return

    const newIconClass = previewIconClass
    confirmedMarkersStore.update((markers) =>
      markers.map((m) =>
        m.id === marker.id
          ? {
              ...m,
              iconClass: newIconClass,
              updated_at: new Date().toISOString(),
            }
          : m,
      ),
    )

    const oldDef = findMarkerByIconClass(marker.iconClass)
    const newDef = findMarkerByIconClass(newIconClass)
    const labelText = `${oldDef?.name || "Marker"} → ${newDef?.name || "Marker"}`
    if (marker.coordinates) showEditRipple(marker.coordinates, labelText)

    resetIconEdit()
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
    previewIconClass = null
  }

  // ── Notes ──
  // Open the note editor and put the cursor straight into the textarea.
  function startNoteEdit() {
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

  // ── Coords + created-date helpers ──
  $: createdShort = marker?.created_at
    ? new Date(marker.created_at).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : ""

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

  async function deletePhoto(photo) {
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
  function toggleMove() {
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
  function armDelete() {
    confirmDelete = true
    clearTimeout(confirmDeleteTimer)
    confirmDeleteTimer = setTimeout(() => (confirmDelete = false), 2500)
  }

  function doDelete() {
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

  onMount(() => {
    position()
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
      class:hidden={!visible || hideForEditor}
      class:down={!openUp}
      on:mousedown={onPanelDragStart}
      on:touchstart={onPanelDragStart}
      style="left:{left}px; top:{top}px;"
      bind:this={markerPopEl}
    >
      <div class="marker-pop-head" on:click={handleHeaderClick}>
        <div class="marker-pop-icon">
          {#if displayIconClass === "default"}
            <IconSVG icon="mapbox-marker" size="24px" />
          {:else if displayIconClass?.startsWith("custom-svg")}
            <IconSVG
              icon={displayIconClass?.replace("custom-svg-", "")}
              size="24px"
            />
          {:else if displayIconClass?.startsWith("ionic-")}
            <ion-icon
              name={displayIconClass?.replace("ionic-", "")}
              style="font-size: 24px;"
            ></ion-icon>
          {:else}
            <i class={`${displayIconClass} text-lg`}></i>
          {/if}
        </div>
        <div class="marker-pop-titles">
          <span class="marker-pop-title" title={markerName}>{markerName}</span>
          {#if createdShort}
            <span class="marker-pop-sub">Created {createdShort}</span>
          {/if}
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
          {#if pendingIconChange}
            <button class="mp-save-btn" on:click={confirmIcon}>
              <Check size={14} />
              <span>Save</span>
            </button>
          {:else}
            <span class="mp-subhead-spacer"></span>
          {/if}
        </div>
        <div class="marker-pop-body">
          <div class="mp-icon-grid">
            {#each selectableMarkers as icon}
              <button
                class="mp-icon-option"
                class:selected={getIsIconSelected(icon)}
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
      {:else}
        <div class="marker-pop-body">
          <div class="mp-main">
            <div class="mp-section">
              <div class="mp-section-head">
                <span class="mp-section-title">
                  <FileText size={12} />
                  <span>Notes</span>
                </span>
                <label class="mp-label-toggle" title="Show map label above marker">
                  <span class="mp-label-toggle-text">Map Label</span>
                  <input
                    type="checkbox"
                    checked={noteLabelVisible}
                    on:change={(e) => toggleNoteLabel(e.currentTarget.checked)}
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
                        on:click|stopPropagation={() => deletePhoto(p)}
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

            <div class="mp-delete-row">
              <button
                class="mp-delete-btn"
                class:armed={confirmDelete}
                on:click={confirmDelete ? doDelete : armDelete}
                title={confirmDelete ? "Tap again to confirm" : "Delete marker"}
              >
                {#if confirmDelete}
                  <Check size={14} />
                  <span>Confirm delete?</span>
                {:else}
                  <Trash2 size={14} />
                  <span>Delete marker</span>
                {/if}
              </button>
            </div>
          </div>
        </div>

        <div class="mp-footer-row">
          <button
            class="mp-action-btn"
            on:click={() => (view = "icon")}
            title="Change icon"
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
            <span>↻ Icon</span>
          </button>
          <button class="mp-action-btn accent" on:click={toggleMove}>
            <span class="mp-action-glyph">
              <Move size={16} />
            </span>
            <span>Move</span>
          </button>
          <button
            class="mp-action-btn"
            class:open={addMenuOpen}
            on:click={() => (addMenuOpen = !addMenuOpen)}
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
    width: 250px;
    height: 360px;
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
    border-radius: 8px;
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
    flex-shrink: 0;
  }
  .marker-pop-titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
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
  .marker-pop-sub {
    min-width: 0;
    font-size: 9px;
    font-weight: 600;
    line-height: 1.2;
    color: rgba(255, 255, 255, 0.45);
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
  }
  .mp-back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px 4px 4px;
    border: none;
    border-radius: 7px;
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
  .mp-subhead-spacer {
    width: 1px;
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

  .mp-save-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 7px;
    border: none;
    background: rgba(96, 165, 250, 0.25);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .mp-save-btn:hover {
    background: rgba(96, 165, 250, 0.4);
  }
  .mp-save-btn:disabled {
    opacity: 0.45;
    cursor: default;
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

  /* Delete marker — subtle danger row at the bottom of the main view */
  .mp-delete-row {
    display: flex;
  }
  .mp-delete-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 9px 10px;
    border-radius: 9px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.08);
    color: rgba(252, 165, 165, 0.85);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .mp-delete-btn:hover {
    background: rgba(239, 68, 68, 0.16);
  }
  .mp-delete-btn.armed {
    background: rgba(239, 68, 68, 0.9);
    color: #fff;
    border-color: rgba(239, 68, 68, 0.9);
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

  /* Icon grid */
  .mp-icon-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .mp-icon-option {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
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
