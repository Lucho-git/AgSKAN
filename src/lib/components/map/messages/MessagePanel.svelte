<!-- src/lib/components/map/messages/MessagePanel.svelte -->
<!-- Conversation with one person, opened from the people/vehicles menu. -->
<script>
  import { onMount, onDestroy, tick } from "svelte"
  import { get } from "svelte/store"
  import { ArrowLeft, Loader2, MapPin, Send, X } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { goto } from "$app/navigation"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    userVehicleStore,
    otherVehiclesStore,
  } from "$lib/stores/vehicleStore"
  import {
    messagePanelStore,
    messageTickStore,
    messageIncomingStore,
    openMessagePanel,
    openMessageInbox,
    closeMessagePanel,
    messageClearUnread,
  } from "$lib/stores/messageStore"
  import { mapPresenceStore } from "$lib/stores/mapPresenceStore"
  import FieldIcon from "$lib/components/map/overlays/FieldIcon.svelte"
  import { confirmedMarkersStore } from "$lib/stores/markerStore"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { getIconImageName } from "$lib/data/markerDefinitions"
  import {
    locationPickStore,
    pickedLocationStore,
    startLocationPick,
    focusMapLocation,
    finishLocationPickReview,
    cancelLocationPick,
  } from "$lib/stores/locationPickStore"
  import {
    fetchConversation,
    fetchMyConversations,
    markConversationRead,
    sendMapMessage,
  } from "$lib/api/messagesApi"

  /** @type {{ view: string, id: string | null, name: string } | null} */
  let panel = null
  /** @type {{ id: string, name: string } | null} */
  let recipient = null
  let messages = []
  /** @type {{ contactId: string, name: string | null, lastBody: string, lastAt: string, lastFromMe: boolean, unread: number }[]} */
  let convos = []
  let loading = false
  let loadingList = false
  let inboxLoaded = false
  let showSpinner = false
  let spinnerTimer = null
  let lastRefreshId = null
  // Last-seen conversation contents — instant paint when re-opening a chat.
  const convCache = new Map()
  // Cache entries seeded from a single live message still need a full load.
  const seededIds = new Set()
  // Background warm-up of recent conversations so first taps don't flicker.
  let eagerLoading = false
  const prefetching = new Set()
  let sending = false
  let draft = ""
  let resolvedName = ""
  /** @type {HTMLElement | null} */
  let listEl = null
  let unsubs = []
  let deepLinkChecked = false
  let pendingAttachment = null
  let reviewAttachment = null
  let mini = false
  let miniRevealed = false
  let panelEl = null
  let dragging = false
  let dragStartY = 0
  let dragDy = 0
  let dragVelocity = 0
  let lastDragY = 0
  let lastDragT = 0
  let dragStartH = 0
  let sheetH = null

  $: me = $profileStore?.id || null
  $: mapId = $profileStore?.master_map_id || null
  $: myName = $profileStore?.full_name || "Someone"
  $: view = panel?.view || "inbox"
  $: recipientOnline = recipient ? $mapPresenceStore.has(recipient.id) : false
  $: displayName =
    view === "inbox"
      ? "Messages"
      : recipient?.name || resolvedName || "Team member"

  // First name for the composer placeholder ("Message Lucho…") — keeps it one line.
  $: shortName =
    (view === "conversation"
      ? (recipient?.name || resolvedName || "").trim().split(/\s+/)[0]
      : "") || ""

  // People on this map (for the inbox "New message" strip) — online first,
  // excluding anyone who already has a message history with us.
  $: convoContactIds = new Set(convos.map((c) => c.contactId))
  $: newMessagePeople = ($otherVehiclesStore || [])
    .filter(
      (v) =>
        v?.vehicle_id &&
        v.vehicle_id !== me &&
        !convoContactIds.has(v.vehicle_id),
    )
    .map((v) => {
      const name = v.full_name || "Team member"
      return { id: v.vehicle_id, name, first: name.split(/\s+/)[0] }
    })
    .sort((a, b) => {
      const ao = $mapPresenceStore.has(a.id) ? 0 : 1
      const bo = $mapPresenceStore.has(b.id) ? 0 : 1
      return ao - bo || a.name.localeCompare(b.name)
    })

  // Free-form sheet sizing: the sheet stays where you leave it. While
  // dragging it follows the finger 1:1 (down shrinks, up grows); on release
  // the height is kept unless it ended up below the close threshold.
  $: sheetDragStyle =
    $locationPickStore.active || $locationPickStore.captured
      ? ""
      : dragging
        ? `height: ${clampSheetHeight(dragStartH - dragDy)}px; transition: none;`
        : sheetH
          ? `height: ${sheetH}px;`
          : ""

  function clampSheetHeight(h) {
    const vh = typeof window === "undefined" ? 800 : window.innerHeight
    return Math.max(70, Math.min(h, vh * 0.94))
  }

  // Opened from a push notification tap ("?messageFrom=<sender id>").
  $: if (browser && me && mapId && !deepLinkChecked) {
    deepLinkChecked = true
    openFromDeepLink()
  }

  onMount(() => {
    unsubs.push(
      messagePanelStore.subscribe((p) => {
        panel = p
        if (!p) {
          // Closed — the next open starts from the default height again.
          sheetH = null
          return
        }
        if (p.view === "inbox") {
          recipient = null
          refreshInbox()
        } else {
          recipient = { id: p.id, name: p.name || "" }
          resolvedName = p.name || vehicleName(p.id) || ""
          draft = ""
          // Instant paint from cache (no spinner flash) while the fresh copy
          // loads; a cold open shows a delayed spinner instead of a flicker.
          messages = convCache.get(p.id) || []
          refresh(true)
        }
      }),
    )
    // A new message arrived — if the panel is closed, still refresh the inbox
    // metadata and warm the conversation cache so tapping a popup opens the
    // conversation instantly.
    unsubs.push(
      messageTickStore.subscribe(() => {
        const p = get(messagePanelStore)
        if (!p) {
          void refreshInbox()
          return
        }
        if (p.view === "inbox") refreshInbox()
        else refresh(false)
      }),
    )
    // Result of the map location picker → hold it for review; it becomes the
    // composer attachment only once the user confirms it on the map.
    unsubs.push(
      pickedLocationStore.subscribe((pick) => {
        if (!pick) return
        const pickState = get(locationPickStore)
        if (pickState.active || pickState.captured) reviewAttachment = pick
        else pendingAttachment = toAttachment(pick)
        pickedLocationStore.set(null)
      }),
    )
    // Incoming message — extend/seed the cache right away so opening the
    // chat from a popup has content on screen from the first frame.
    unsubs.push(
      messageIncomingStore.subscribe((msg) => {
        if (!msg?.sender_id) return
        const id = msg.sender_id
        const cached = convCache.get(id)
        if (cached) {
          if (!cached.some((m) => m.id === msg.id)) {
            convCache.set(id, [...cached, msg])
          }
        } else {
          // Cold conversation — seed with just this message; the background
          // prefetch (and the open refresh) fill in the full history.
          convCache.set(id, [msg])
          seededIds.add(id)
        }
      }),
    )
    void loadMarkerIconPaths()
    return () => unsubs.forEach((u) => u())
  })

  // Received location chips resolve the same little icons the picker uses.
  let markerIconPaths = null
  let markerIconPathsReady = false

  async function loadMarkerIconPaths() {
    if (markerIconPaths || !browser) return
    try {
      const res = await fetch("/icon-paths.json")
      markerIconPaths = await res.json()
      markerIconPathsReady = true
    } catch (error) {
      console.warn("Could not load icon paths:", error)
    }
  }

  function markerIconUrl(refId) {
    if (!markerIconPaths || refId === null || refId === undefined) return null
    try {
      const marker = $confirmedMarkersStore?.find(
        (m) => String(m.id) === String(refId),
      )
      const base = getIconImageName(marker?.iconClass)
      const path = markerIconPaths[base]
      return path ? `/${path}` : null
    } catch {
      return null
    }
  }

  function fieldShape(refId) {
    if (refId === null || refId === undefined) return null
    return $mapFieldsStore?.[refId]?.boundary || null
  }

  // Live position of a vehicle from the vehicle stores (null when unknown).
  function vehicleLiveCoords(refId) {
    try {
      const own = $userVehicleStore
      const source =
        own?.vehicle_id && own.vehicle_id === refId
          ? own
          : $otherVehiclesStore?.find((v) => v.vehicle_id === refId)
      const coords = source?.coordinates
      if (!coords) return null
      if (typeof coords === "object" && coords.latitude && coords.longitude) {
        return { lng: Number(coords.longitude), lat: Number(coords.latitude) }
      }
      if (typeof coords === "string") {
        const [lng, lat] = coords.slice(1, -1).split(",").map(parseFloat)
        if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat }
      }
      if (Array.isArray(coords) && coords.length >= 2) {
        return { lng: Number(coords[0]), lat: Number(coords[1]) }
      }
    } catch {
      // ignore malformed coordinates
    }
    return null
  }

  // Live clone of a vehicle's map icon (best effort — the vehicle has to be
  // on the map right now).
  function vehicleIconHtml(refId) {
    if (refId === null || refId === undefined || !browser) return null
    try {
      return (
        document.querySelector(`[data-vehicle-id="${refId}"] svg`)?.outerHTML ||
        null
      )
    } catch {
      return null
    }
  }

  function vehicleName(id) {
    const match = $otherVehiclesStore?.find?.((v) => v.vehicle_id === id)
    return match?.full_name || ""
  }

  async function openFromDeepLink() {
    try {
      const from = new URL(window.location.href).searchParams.get("messageFrom")
      if (!from || from === me) return
      if (!get(messagePanelStore)) {
        openMessagePanel({ id: from, name: vehicleName(from) })
      }
      // Drop the param so a refresh doesn't reopen the panel.
      const url = new URL(window.location.href)
      url.searchParams.delete("messageFrom")
      await goto(url.pathname + url.search, {
        replaceState: true,
        keepFocus: true,
        noScroll: true,
      })
    } catch (error) {
      console.warn("Message deep link failed:", error)
    }
  }

  async function refreshInbox() {
    if (!me || !mapId) return
    loadingList = true
    try {
      convos = await fetchMyConversations(mapId, me)
    } catch (error) {
      console.warn("Conversation list load failed:", error)
    } finally {
      loadingList = false
      inboxLoaded = true
      void prefetchRecentConversations()
    }
  }

  // Warm the cache for the most recent conversations so the first tap into
  // one paints instantly instead of flashing a spinner. Best-effort, runs
  // sequentially in the background and skips open / in-flight / cached chats.
  async function prefetchRecentConversations() {
    if (eagerLoading || !me || !mapId) return
    eagerLoading = true
    try {
      // Need the conversation list to know what to warm.
      if (!convos.length) await refreshInbox()
      for (const convo of convos.slice(0, 6)) {
        const id = convo.contactId
        if (!id || id === recipient?.id) continue
        if (prefetching.has(id)) continue
        // Seeded entries only hold one message — still worth a full load.
        if (convCache.has(id) && !seededIds.has(id)) continue
        prefetching.add(id)
        try {
          const rows = await fetchConversation(mapId, me, id)
          if (recipient?.id !== id) {
            convCache.set(id, rows)
            seededIds.delete(id)
          }
        } catch {
          // Best-effort — the normal open path still loads it.
        } finally {
          prefetching.delete(id)
        }
      }
    } finally {
      eagerLoading = false
    }
  }

  function handleAttachLocation() {
    mini = false
    sheetH = null
    startLocationPick()
  }

  // Persist only the compact attachment fields — the pick result also carries
  // transient preview data (icon URL / SVG / geometry) used by the strip.
  function toAttachment(pick) {
    if (!pick) return pick
    return {
      kind: "location",
      lng: pick.lng,
      lat: pick.lat,
      label: pick.label ?? null,
      refType: pick.refType ?? null,
      refId: pick.refId ?? null,
    }
  }

  // Review strip: confirm the location currently selected on the map.
  function confirmPickedLocation() {
    if (reviewAttachment) {
      // Keep the preview info (icon / geometry) on the pending chip — it's
      // stripped back to the compact attachment when the message is sent.
      pendingAttachment = reviewAttachment
      reviewAttachment = null
    }
    finishLocationPickReview()
  }

  // Review strip: abandon the pick; the previous attachment stays untouched.
  function cancelPickedLocation() {
    reviewAttachment = null
    cancelLocationPick()
  }

  function openLocation(attachment) {
    if (!attachment) return
    let lng = attachment.lng
    let lat = attachment.lat
    // Vehicles keep moving — fly to their live position from the vehicle
    // stores instead of where they were when the message was sent.
    if (attachment.refType === "vehicle") {
      const live = vehicleLiveCoords(attachment.refId)
      if (live) {
        lng = live.lng
        lat = live.lat
      }
    }
    focusMapLocation({
      lng,
      lat,
      label: attachment.label || "Shared location",
      refType: attachment.refType || null,
      refId: attachment.refId || null,
    })
    // On phones, shrink the sheet so the map is visible.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches
    ) {
      sheetH = null
      mini = true
    }
  }

  function onDragStart(event) {
    if (dragging) return
    dragging = true
    miniRevealed = false
    dragStartY = event.clientY
    dragDy = 0
    dragVelocity = 0
    lastDragY = event.clientY
    lastDragT = performance.now()
    dragStartH =
      panelEl?.getBoundingClientRect?.().height ||
      (typeof window === "undefined" ? 500 : window.innerHeight * 0.6)
    try {
      // Capture on the panel so the drag keeps tracking outside the header.
      panelEl?.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture unsupported — move/up still track while over the panel.
    }
  }

  // The whole top bar starts a sheet drag, except actual controls (back, close,
  // links…) so those still receive their normal clicks.
  function onHeaderDragStart(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (event.target.closest("button, a, input, textarea, [role='button']")) {
      return
    }
    onDragStart(event)
  }

  function onDragMove(event) {
    if (!dragging) return
    const now = performance.now()
    dragDy = event.clientY - dragStartY
    // Pulling up off the mini bar → reveal the conversation immediately
    // instead of waiting for the release.
    if (mini && dragDy < -24) {
      mini = false
      miniRevealed = true
      // Revealing un-hides the list whose scroll position was lost — pin it
      // straight back to the newest messages so every drag position shows
      // the bottom of the conversation.
      pinListToBottom()
    }
    const dt = now - lastDragT
    if (dt > 0) {
      const instant = (event.clientY - lastDragY) / dt // px per ms
      dragVelocity = dragVelocity * 0.7 + instant * 0.3 // smoothed
    }
    lastDragY = event.clientY
    lastDragT = now
  }

  function onDragEnd() {
    if (!dragging) return
    dragging = false
    const vh = typeof window === "undefined" ? 800 : window.innerHeight
    const finalH = clampSheetHeight(dragStartH - dragDy)
    // Dismiss only on a downward flick, or when pulled below the threshold —
    // otherwise the sheet just stays where it was left.
    const flingDown = dragVelocity > 0.5
    if (
      (flingDown && dragDy > 40) ||
      (finalH < vh * 0.18 && finalH < dragStartH - 24)
    ) {
      closeMessagePanel()
    } else {
      if (mini && finalH > 120) mini = false
      sheetH = finalH
      // Keep it pinned while the sheet settles after a mini-bar reveal.
      if (miniRevealed) {
        miniRevealed = false
        pinListToBottom()
      }
    }
    dragDy = 0
    dragVelocity = 0
  }

  onDestroy(() => {
    unsubs.forEach((u) => u())
  })

  async function refresh(markRead) {
    const target = recipient
    if (!target || !me || !mapId) return
    // Opening a conversation always lands at the bottom; refreshes of the
    // open conversation keep position unless we were already at the bottom.
    const switched = lastRefreshId !== target.id
    lastRefreshId = target.id
    const stickToBottom =
      switched || !listEl || messages.length === 0
        ? true
        : listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120
    loading = true
    // Delay the spinner briefly so fast loads never flash "Loading…".
    if (messages.length === 0) {
      clearTimeout(spinnerTimer)
      spinnerTimer = setTimeout(() => {
        showSpinner = true
      }, 180)
    }
    try {
      const rows = await fetchConversation(mapId, me, target.id)
      // Ignore results if the panel moved on to someone else mid-flight.
      if (recipient?.id !== target.id) return
      messages = rows
      convCache.set(target.id, rows)
      seededIds.delete(target.id)
      if (!resolvedName) {
        resolvedName =
          vehicleName(target.id) ||
          rows.find((m) => m.sender_id === target.id)?.sender_name ||
          ""
      }
      if (markRead) {
        await markConversationRead(mapId, me, target.id)
        messageClearUnread(target.id)
      }
      await tick()
      if (listEl && stickToBottom) listEl.scrollTop = listEl.scrollHeight
    } catch (error) {
      console.warn("Conversation load failed:", error)
    } finally {
      clearTimeout(spinnerTimer)
      showSpinner = false
      loading = false
    }
    // Warm the other recent chats while this one settles.
    void prefetchRecentConversations()
  }

  // Land on the latest messages whenever the list (re)mounts — covers
  // switching conversations and returning from the location picker.
  function pinToBottom(node) {
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight
    })
  }

  // Pin the conversation to the newest message after visibility/height
  // changes — the list's scroll position is lost while it's display:none'd
  // (mini bar), so it must be re-pinned the moment it reappears.
  function pinListToBottom() {
    tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight
    })
  }

  function initials(name) {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2)
    if (parts.length === 0) return "?"
    return parts.map((p) => p[0].toUpperCase()).join("")
  }

  function avatarColor(id) {
    let hash = 0
    for (let i = 0; i < (id || "").length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) % 360
    }
    return `hsl(${hash}, 62%, 42%)`
  }

  function convoName(convo) {
    return convo.name || vehicleName(convo.contactId) || "Team member"
  }

  function shortTime(iso) {
    try {
      const date = new Date(iso)
      const diff = Date.now() - date.getTime()
      if (diff < 60_000) return "now"
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
      if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
      return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    } catch {
      return ""
    }
  }

  async function send() {
    const body = draft.trim()
    const target = recipient
    const attachment = pendingAttachment
    if ((!body && !attachment) || !target || !me || !mapId || sending) return
    sending = true
    try {
      await sendMapMessage({
        masterMapId: mapId,
        senderId: me,
        senderName: myName,
        recipientId: target.id,
        body,
        attachment: toAttachment(attachment),
      })
      draft = ""
      pendingAttachment = null
      await refresh(false)

      // Offline recipient → make their phone buzz.
      if (!$mapPresenceStore.has(target.id)) {
        supabase.functions
          .invoke("send-message-push", {
            body: {
              recipient_id: target.id,
              sender_name: myName,
              body,
            },
          })
          .then(({ error }) => {
            if (error) console.warn("Message push failed:", error)
          })
          .catch((error) => console.warn("Message push failed:", error))
      }
    } catch (error) {
      toast.error("Could not send message", {
        description: error?.message || "Try again.",
      })
    } finally {
      sending = false
    }
  }

  function onKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    } catch {
      return ""
    }
  }
</script>

{#if panel}
  <div
    class="msg-panel"
    class:mini
    class:picking={$locationPickStore.active || $locationPickStore.captured}
    style={sheetDragStyle}
    bind:this={panelEl}
    on:pointermove={onDragMove}
    on:pointerup={onDragEnd}
    on:pointercancel={onDragEnd}
  >
    {#if $locationPickStore.active || $locationPickStore.captured}
      <!-- Location picker strip — the pick stays inside the message modal -->
      <div class="msg-pick-strip">
        <span class="msg-pick-icon">
          {#if $locationPickStore.active}
            <MapPin size={15} />
          {:else if reviewAttachment?.iconUrl}
            <img src={reviewAttachment.iconUrl} alt="" />
          {:else if reviewAttachment?.iconHtml}
            {@html reviewAttachment.iconHtml}
          {:else if reviewAttachment?.geo}
            {#key `${reviewAttachment.refId}:${reviewAttachment.lng},${reviewAttachment.lat}`}
              <FieldIcon geojson={reviewAttachment.geo} size={22} />
            {/key}
          {:else}
            <MapPin size={15} />
          {/if}
        </span>
        {#if $locationPickStore.active}
          <p class="msg-pick-text">
            Tap the map to choose a location — a marker, a field, a vehicle, or
            any spot.
          </p>
        {:else}
          <div class="msg-pick-meta">
            <p class="msg-pick-title">
              {reviewAttachment?.label ||
                (reviewAttachment
                  ? `${reviewAttachment.lat.toFixed(5)}, ${reviewAttachment.lng.toFixed(5)}`
                  : "Location")}
            </p>
            <p class="msg-pick-sub">Tap the map to pick something else</p>
          </div>
        {/if}
        <div class="msg-pick-actions">
          {#if $locationPickStore.captured}
            <button
              class="msg-pick-confirm"
              on:click={confirmPickedLocation}
              title="Attach this location"
            >
              Confirm
            </button>
          {/if}
          <button
            class="msg-pick-cancel"
            on:click={cancelPickedLocation}
            aria-label="Cancel location pick"
            title="Cancel"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    {:else}
      <!-- Drag handle (mobile bottom sheet). pointermove/up live on the panel
         root so a drag keeps tracking even when the finger leaves the handle. -->
      <div
        class="msg-drag-handle"
        on:pointerdown={onDragStart}
        role="separator"
        aria-label="Drag to resize"
      >
        <span></span>
      </div>
      <!-- Header — the whole bar starts a sheet drag (buttons stay clickable) -->
      <div class="msg-panel-head" on:pointerdown={onHeaderDragStart}>
        {#if view === "conversation"}
          <button
            class="msg-panel-back"
            on:click={openMessageInbox}
            aria-label="All messages"
            title="All messages"
          >
            <ArrowLeft size={18} />
          </button>
        {/if}
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-bold text-white">{displayName}</p>
          {#if mini}
            <p class="mt-0.5 text-[10px] text-white/40">
              Drag up to reopen — showing location on map
            </p>
          {:else}
            <p class="mt-0.5 flex items-center gap-1.5 text-[10px]">
              {#if view === "conversation"}
                <span
                  class="inline-block h-1.5 w-1.5 rounded-full {recipientOnline
                    ? 'bg-emerald-400'
                    : 'bg-white/30'}"
                ></span>
                <span
                  class={recipientOnline ? "text-emerald-300" : "text-white/40"}
                >
                  {recipientOnline ? "Online" : "Offline"}
                </span>
              {:else}
                <span class="text-white/40">
                  {convos.length === 1
                    ? "1 conversation"
                    : `${convos.length} conversations`}
                </span>
              {/if}
            </p>
          {/if}
        </div>
        <button
          class="msg-panel-close"
          on:click={closeMessagePanel}
          aria-label="Close messages"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>

      {#if view === "inbox"}
        <!-- Inbox: everyone I've exchanged messages with -->
        <div class="msg-panel-list">
          {#if inboxLoaded && newMessagePeople.length > 0}
            <!-- New message: pick any person on the map -->
            <div class="msg-new-section">
              <p class="msg-new-title">New message</p>
              <div class="msg-new-strip">
                {#each newMessagePeople as person (person.id)}
                  <button
                    class="msg-new-person"
                    on:click={() =>
                      openMessagePanel({ id: person.id, name: person.name })}
                    title={person.name}
                  >
                    <span
                      class="msg-avatar"
                      style="background: {avatarColor(person.id)}"
                    >
                      {initials(person.name)}
                      {#if $mapPresenceStore.has(person.id)}
                        <span class="msg-avatar-online"></span>
                      {/if}
                    </span>
                    <span class="msg-new-name">{person.first}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          {#if loadingList && convos.length === 0}
            <div
              class="flex items-center justify-center gap-2 py-8 text-white/50"
            >
              <Loader2 size={14} class="animate-spin" />
              <span class="text-[11px]">Loading…</span>
            </div>
          {:else if convos.length === 0}
            <p class="py-8 text-center text-[11px] text-white/45">
              No conversations yet.<br />Pick someone above to start one.
            </p>
          {:else}
            {#each convos as convo (convo.contactId)}
              {@const online = $mapPresenceStore.has(convo.contactId)}
              <button
                class="msg-convo"
                on:click={() =>
                  openMessagePanel({
                    id: convo.contactId,
                    name: convo.name || vehicleName(convo.contactId),
                  })}
              >
                <span
                  class="msg-avatar"
                  style="background: {avatarColor(convo.contactId)}"
                >
                  {initials(convoName(convo))}
                  {#if online}<span class="msg-avatar-online"></span>{/if}
                </span>
                <span class="min-w-0 flex-1 text-left">
                  <span class="msg-convo-top">
                    <span class="msg-convo-name">{convoName(convo)}</span>
                    <span class="msg-convo-time">{shortTime(convo.lastAt)}</span
                    >
                  </span>
                  <span class="msg-convo-preview">
                    {convo.lastFromMe ? "You: " : ""}{convo.lastBody}
                  </span>
                </span>
                {#if convo.unread > 0}
                  <span class="msg-convo-badge">{convo.unread}</span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      {:else}
        <!-- Conversation -->
        {#key recipient?.id}
          <div
            class="msg-panel-list msg-list-fade"
            bind:this={listEl}
            use:pinToBottom
          >
            {#if showSpinner && messages.length === 0}
              <div
                class="flex items-center justify-center gap-2 py-8 text-white/50"
              >
                <Loader2 size={14} class="animate-spin" />
                <span class="text-[11px]">Loading…</span>
              </div>
            {:else if messages.length === 0}
              <p class="py-8 text-center text-[11px] text-white/45">
                No messages yet — say g'day 👋
              </p>
            {:else}
              {#each messages as msg (msg.id)}
                {@const mine = msg.sender_id === me}
                <div class="msg-row {mine ? 'mine' : ''}">
                  {#if msg.attachment}
                    <button
                      class="msg-loc-chip"
                      on:click={() => openLocation(msg.attachment)}
                      title="Show on map"
                    >
                      {#if markerIconPathsReady && msg.attachment.refType === "marker" && markerIconUrl(msg.attachment.refId)}
                        <img src={markerIconUrl(msg.attachment.refId)} alt="" />
                      {:else if msg.attachment.refType === "field" && fieldShape(msg.attachment.refId)}
                        {#key fieldShape(msg.attachment.refId)}
                          <FieldIcon
                            geojson={fieldShape(msg.attachment.refId)}
                            size={14}
                          />
                        {/key}
                      {:else if msg.attachment.refType === "vehicle" && vehicleIconHtml(msg.attachment.refId)}
                        {@html vehicleIconHtml(msg.attachment.refId)}
                      {:else}
                        <MapPin size={12} />
                      {/if}
                      <span>{msg.attachment.label || "Dropped pin"}</span>
                    </button>
                  {/if}
                  {#if msg.body}
                    <div class="msg-bubble {mine ? 'mine' : ''}">
                      {msg.body}
                    </div>
                  {/if}
                  <span class="msg-time">{formatTime(msg.created_at)}</span>
                </div>
              {/each}
            {/if}
          </div>
        {/key}

        <!-- Composer -->
        {#if !recipientOnline}
          <p class="msg-offline-hint">
            They're offline — your message will also send as a phone
            notification.
          </p>
        {/if}
        {#if pendingAttachment}
          <div class="msg-pending-attach">
            {#if pendingAttachment.iconUrl}
              <img src={pendingAttachment.iconUrl} alt="" />
            {:else if pendingAttachment.iconHtml}
              {@html pendingAttachment.iconHtml}
            {:else if pendingAttachment.geo}
              {#key pendingAttachment.refId}
                <FieldIcon geojson={pendingAttachment.geo} size={18} />
              {/key}
            {:else if markerIconPathsReady && pendingAttachment.refType === "marker" && markerIconUrl(pendingAttachment.refId)}
              <img src={markerIconUrl(pendingAttachment.refId)} alt="" />
            {:else if pendingAttachment.refType === "field" && fieldShape(pendingAttachment.refId)}
              {#key fieldShape(pendingAttachment.refId)}
                <FieldIcon
                  geojson={fieldShape(pendingAttachment.refId)}
                  size={18}
                />
              {/key}
            {:else if pendingAttachment.refType === "vehicle" && vehicleIconHtml(pendingAttachment.refId)}
              {@html vehicleIconHtml(pendingAttachment.refId)}
            {:else}
              <MapPin size={12} />
            {/if}
            <span class="min-w-0 flex-1 truncate">
              {pendingAttachment.label ||
                `${pendingAttachment.lat.toFixed(5)}, ${pendingAttachment.lng.toFixed(5)}`}
            </span>
            <button
              on:click={() => (pendingAttachment = null)}
              aria-label="Remove location"
              title="Remove location"
            >
              <X size={12} />
            </button>
          </div>
        {/if}
        <div class="msg-panel-input">
          <button
            class="msg-attach-btn"
            on:click={handleAttachLocation}
            aria-label="Attach location"
            title="Attach location"
          >
            <MapPin size={16} />
          </button>
          <textarea
            rows="1"
            placeholder={shortName ? `Message ${shortName}…` : "Message…"}
            bind:value={draft}
            on:keydown={onKeydown}
            maxlength="500"
          ></textarea>
          <button
            class="msg-send-btn"
            on:click={send}
            disabled={sending || (!draft.trim() && !pendingAttachment)}
            aria-label="Send message"
            title="Send"
          >
            {#if sending}
              <Loader2 size={14} class="animate-spin" />
            {:else}
              <Send size={14} />
            {/if}
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .msg-panel {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 90;
    display: flex;
    width: min(340px, calc(100vw - 24px));
    max-height: min(65vh, 520px);
    flex-direction: column;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 10, 12, 0.94);
    color: #fff;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(12px);
    overflow: hidden;
  }

  .msg-panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    /* The whole bar is a drag surface (buttons excluded) — suppress text
       selection and let pointer drags own the gesture. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
  }

  .msg-panel-close {
    display: flex;
    height: 24px;
    width: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    color: rgba(255, 255, 255, 0.55);
  }

  .msg-panel-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .msg-panel-list {
    flex: 1;
    min-height: 120px;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Soft fade when a conversation (re)mounts — keeps switches feeling calm. */
  .msg-list-fade {
    animation: msg-list-in 0.16s ease-out;
  }

  @keyframes msg-list-in {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 1;
    }
  }

  .msg-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 100%;
  }

  .msg-row.mine {
    align-items: flex-end;
  }

  .msg-bubble {
    max-width: 85%;
    border-radius: 12px;
    border-bottom-left-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    padding: 6px 10px;
    font-size: 12px;
    line-height: 1.4;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .msg-bubble.mine {
    border-radius: 12px;
    border-bottom-right-radius: 4px;
    border-bottom-left-radius: 12px;
    background: rgba(56, 189, 248, 0.22);
  }

  .msg-time {
    margin-top: 2px;
    font-size: 9px;
    color: rgba(255, 255, 255, 0.35);
  }

  .msg-offline-hint {
    padding: 5px 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 10px;
    color: rgba(251, 191, 36, 0.85);
  }

  .msg-panel-input {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 8px 10px 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .msg-panel-input textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.07);
    padding: 7px 10px;
    font-size: 12px;
    color: #fff;
    outline: none;
    max-height: 90px;
  }

  .msg-panel-input textarea::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  .msg-panel-input textarea:focus {
    border-color: rgba(56, 189, 248, 0.55);
  }

  .msg-send-btn {
    display: flex;
    height: 32px;
    width: 32px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px solid rgba(56, 189, 248, 0.35);
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
  }

  .msg-send-btn:hover:not(:disabled) {
    background: rgba(56, 189, 248, 0.32);
  }

  .msg-send-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* Larger, easier-to-press header buttons */
  .msg-panel-close,
  .msg-panel-back {
    display: flex;
    height: 36px;
    width: 36px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.7);
  }

  .msg-panel-close:hover,
  .msg-panel-back:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  /* ── Inbox rows ── */
  .msg-convo {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    border-radius: 12px;
    padding: 9px 10px;
  }

  .msg-convo:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .msg-avatar {
    position: relative;
    display: flex;
    height: 38px;
    width: 38px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
  }

  .msg-avatar-online {
    position: absolute;
    right: -1px;
    bottom: -1px;
    height: 11px;
    width: 11px;
    border-radius: 9999px;
    border: 2px solid rgba(10, 10, 12, 0.95);
    background: #34d399;
  }

  /* ── Inbox: new-message people strip ── */
  .msg-new-section {
    margin: 2px 0 8px;
  }

  .msg-new-title {
    margin: 0 0 6px 2px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.4);
  }

  .msg-new-strip {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .msg-new-person {
    display: flex;
    width: 56px;
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .msg-new-person .msg-avatar {
    height: 34px;
    width: 34px;
    font-size: 12px;
  }

  .msg-new-name {
    width: 100%;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.75);
  }

  .msg-convo-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .msg-convo-name {
    font-size: 12.5px;
    font-weight: 700;
    color: #fff;
  }

  .msg-convo-time {
    flex-shrink: 0;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
  }

  .msg-convo-preview {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.55);
    overflow-wrap: anywhere;
  }

  .msg-convo-badge {
    display: flex;
    min-width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: #f59e0b;
    padding: 0 6px;
    font-size: 10.5px;
    font-weight: 700;
    color: #1f2937;
  }

  /* ── Drag handle, mini bar + mobile bottom sheet ── */
  .msg-drag-handle {
    display: none;
  }

  .msg-panel.picking {
    height: auto;
    transition: none;
  }

  /* ── Location picker strip (kept inside the modal) ── */
  .msg-pick-strip {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 13px 12px calc(13px + env(safe-area-inset-bottom));
  }

  .msg-pick-icon {
    display: flex;
    height: 30px;
    width: 30px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
  }

  .msg-pick-icon img {
    display: block;
    width: 22px;
    height: 22px;
  }

  /* Injected child-component SVGs (vehicle icon, mini field shape) — size
     them down; the lucide pin keeps its own size. */
  .msg-pick-icon :global(svg:not(.lucide)) {
    display: block;
    width: 22px !important;
    height: 22px !important;
  }

  .msg-pick-text {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.85);
  }

  .msg-pick-meta {
    flex: 1;
    min-width: 0;
  }

  .msg-pick-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    font-weight: 700;
    color: #fff;
  }

  .msg-pick-sub {
    margin-top: 2px;
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.45);
  }

  .msg-pick-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
  }

  .msg-pick-confirm {
    height: 34px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid rgba(56, 189, 248, 0.45);
    background: rgba(56, 189, 248, 0.22);
    font-size: 12px;
    font-weight: 700;
    color: #bae6fd;
  }

  .msg-pick-confirm:hover {
    background: rgba(56, 189, 248, 0.34);
    color: #fff;
  }

  .msg-pick-cancel {
    display: flex;
    height: 34px;
    width: 34px;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.6);
  }

  .msg-pick-cancel:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .msg-panel.mini {
    height: 84px;
  }

  .msg-panel.mini .msg-panel-list,
  .msg-panel.mini .msg-panel-input,
  .msg-panel.mini .msg-offline-hint,
  .msg-panel.mini .msg-pending-attach {
    display: none;
  }

  @media (max-width: 640px) {
    .msg-panel {
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-height: none;
      height: 60vh;
      border-radius: 16px 16px 0 0;
      border-bottom: none;
      transition:
        height 0.3s cubic-bezier(0.32, 0.72, 0, 1),
        transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
      will-change: height, transform;
    }

    /* Thinner grab strip, same tone as the header — they read as one bar. */
    .msg-drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 16px;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.03);
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }

    .msg-drag-handle span {
      width: 40px;
      height: 4px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.28);
    }

    .msg-panel-list {
      padding: 12px 14px;
    }

    .msg-bubble {
      max-width: 82%;
      padding: 8px 12px;
      font-size: 13.5px;
    }

    .msg-time {
      font-size: 10px;
    }

    .msg-offline-hint {
      font-size: 11px;
    }

    .msg-panel-input {
      padding: 8px 12px calc(10px + env(safe-area-inset-bottom));
    }

    .msg-panel-input textarea {
      font-size: 15px;
      padding: 10px 12px;
      max-height: 120px;
    }

    .msg-send-btn,
    .msg-attach-btn {
      height: 42px;
      width: 42px;
      border-radius: 12px;
    }
  }

  /* ── Location attachments ── */
  .msg-loc-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 3px;
    border-radius: 10px;
    border: 1px solid rgba(56, 189, 248, 0.35);
    background: rgba(56, 189, 248, 0.14);
    padding: 5px 9px;
    font-size: 11px;
    font-weight: 600;
    color: #7dd3fc;
    cursor: pointer;
  }

  .msg-loc-chip:hover {
    background: rgba(56, 189, 248, 0.26);
  }

  .msg-loc-chip img {
    display: block;
    width: 14px;
    height: 14px;
  }

  .msg-loc-chip :global(svg:not(.lucide)) {
    display: block;
    width: 14px !important;
    height: 14px !important;
  }

  .msg-pending-attach {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 10px;
    margin-bottom: 6px;
    min-height: 40px;
    border-radius: 10px;
    border: 1px solid rgba(56, 189, 248, 0.3);
    background: rgba(56, 189, 248, 0.12);
    padding: 8px 10px;
    font-size: 12px;
    color: #7dd3fc;
  }

  .msg-pending-attach button {
    display: flex;
    height: 20px;
    width: 20px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
  }

  .msg-pending-attach button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .msg-pending-attach img {
    display: block;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .msg-pending-attach :global(svg:not(.lucide)) {
    display: block;
    width: 18px !important;
    height: 18px !important;
    flex-shrink: 0;
  }

  .msg-attach-btn {
    display: flex;
    height: 36px;
    width: 36px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.75);
  }

  /* Match the send button sizing (slightly larger than the original). */
  .msg-send-btn {
    height: 36px;
    width: 36px;
    border-radius: 10px;
  }

  .msg-attach-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  /* ── Composer buttons — final sizing ──
     The attach (pin) and send buttons must always render identical. This
     block lives last in the stylesheet so it wins over every earlier rule. */
  .msg-attach-btn,
  .msg-send-btn {
    height: 36px;
    width: 36px;
    border-radius: 10px;
    box-sizing: border-box;
  }

  @media (max-width: 640px) {
    .msg-attach-btn,
    .msg-send-btn {
      height: 44px;
      width: 44px;
      border-radius: 12px;
    }

    .msg-panel-input textarea {
      min-height: 44px;
    }
  }
</style>
