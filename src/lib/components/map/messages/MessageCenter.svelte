<!-- src/lib/components/map/messages/MessageCenter.svelte -->
<!-- Listens for incoming messages, shows in-app popups + unread badges. -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { MessageSquare, Reply, X } from "lucide-svelte"
  import { App } from "@capacitor/app"
  import { Capacitor } from "@capacitor/core"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    messagePanelStore,
    messageBumpUnread,
    messageSetUnread,
    messageBumpTick,
    messageIncomingStore,
    openMessagePanel,
  } from "$lib/stores/messageStore"
  import { fetchUnreadBySender } from "$lib/api/messagesApi"

  let me = null
  let mapId = null
  let channel = null
  /** @type {{ key: number, senderId: string, name: string, body: string }[]} */
  let popups = []
  let popupSeq = 0
  // Messages that arrived while the app/tab was hidden — shown on return.
  let pendingPopups = []
  let appStateListener = null

  $: me = $profileStore?.id || null
  $: mapId = $profileStore?.master_map_id || null

  let panelUnsub = null

  onMount(() => {
    // Opening the panel for someone dismisses their popups (the panel marks
    // the conversation read).
    panelUnsub = messagePanelStore.subscribe((panel) => {
      if (!panel) return
      popups = popups.filter((p) => p.senderId !== panel.id)
      pendingPopups = pendingPopups.filter((p) => p.sender_id !== panel.id)
    })

    // Coming back to the tab/edge → show previews held while we were away.
    const onVisibility = () => {
      if (!document.hidden) flushPendingPopups()
    }
    document.addEventListener("visibilitychange", onVisibility)
    if (Capacitor.isNativePlatform()) {
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) flushPendingPopups()
      }).then((listener) => {
        appStateListener = listener
      })
    }

    return () => {
      panelUnsub?.()
      document.removeEventListener("visibilitychange", onVisibility)
      appStateListener?.remove?.()
    }
  })

  $: if (me && mapId) {
    if (!initialised) {
      initialised = true
      init(me, mapId)
    }
  }

  let initialised = false

  async function init(myId, myMapId) {
    try {
      messageSetUnread(await fetchUnreadBySender(myMapId, myId))
    } catch (error) {
      console.warn("Unread message counts failed:", error)
    }

    channel = supabase
      .channel(`map_messages_${myMapId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "map_messages",
          filter: `master_map_id=eq.${myMapId}`,
        },
        (payload) => {
          const msg = payload.new
          if (!msg || msg.sender_id === myId) return
          if (msg.recipient_id !== myId) return

          messageBumpTick()
          // Let the panel seed its cache from this row before anything else.
          messageIncomingStore.set(msg)
          const panel = get(messagePanelStore)
          if (panel && (panel.id === msg.sender_id || panel.view === "inbox")) {
            return // already looking at messages
          }

          messageBumpUnread(msg.sender_id)
          // App/tab hidden — hold the preview and show it when they return.
          if (typeof document !== "undefined" && document.hidden) {
            pendingPopups = [...pendingPopups.slice(-2), msg]
            return
          }
          addPopup(msg)
        },
      )
      .subscribe()
  }

  function flushPendingPopups() {
    if (!pendingPopups.length) return
    const queued = pendingPopups
    pendingPopups = []
    const panel = get(messagePanelStore)
    for (const msg of queued.slice(-3)) {
      if (panel && (panel.id === msg.sender_id || panel.view === "inbox")) {
        continue // already reading that conversation
      }
      addPopup(msg)
    }
  }

  function addPopup(msg) {
    const key = ++popupSeq
    popups = [
      ...popups.slice(-2),
      {
        key,
        senderId: msg.sender_id,
        name: msg.sender_name || "Team member",
        body: msg.body || "",
        attachmentLabel: msg.attachment
          ? msg.attachment.label || "Shared a location"
          : null,
      },
    ]
    // Popups stay until dismissed with the X (no auto-hide).
  }

  function dismissPopup(key) {
    popups = popups.filter((p) => p.key !== key)
  }

  // ── Swipe to dismiss ──
  let dragKey = null
  let dragStartX = 0
  let dragStartY = 0
  let dragDx = 0
  let swiping = false
  let suppressClick = false
  let flyingKey = null
  let flyDx = 0

  // A swipe ends with a click — consume it so the popup doesn't open.
  function consumeIfSwiped() {
    if (!suppressClick) return false
    suppressClick = false
    return true
  }

  function popupStyle(popup) {
    if (dragKey === popup.key) {
      return `transform: translateX(${dragDx}px); transition: none; opacity: ${Math.max(0.35, 1 - Math.abs(dragDx) / 260)};`
    }
    if (flyingKey === popup.key) {
      return `transform: translateX(${flyDx}px); opacity: 0; transition: transform 0.16s ease-out, opacity 0.16s ease-out;`
    }
    return ""
  }

  function onSwipeStart(event, popup) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    suppressClick = false
    swiping = false
    dragKey = popup.key
    dragStartX = event.clientX
    dragStartY = event.clientY
    dragDx = 0
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // capture unsupported — move/up still track over the card
    }
  }

  function onSwipeMove(event) {
    if (dragKey === null) return
    const dx = event.clientX - dragStartX
    const dy = event.clientY - dragStartY
    if (!swiping) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      // Vertical movement wins → let the stack scroll, don't swipe.
      if (Math.abs(dy) > Math.abs(dx)) {
        releaseSwipe()
        return
      }
      swiping = true
    }
    dragDx = dx
  }

  function releaseSwipe() {
    dragKey = null
    dragDx = 0
    swiping = false
  }

  function onSwipeEnd() {
    if (dragKey === null) return
    const key = dragKey
    const dx = dragDx
    const moved = swiping
    dragKey = null
    dragDx = 0
    swiping = false
    if (!moved) return
    // Don't let the trailing click open/dismiss anything.
    suppressClick = true
    if (Math.abs(dx) > 90) {
      flyingKey = key
      flyDx = dx > 0 ? 170 : -170
      setTimeout(() => {
        dismissPopup(key)
        if (flyingKey === key) flyingKey = null
      }, 170)
    }
    // Under the threshold → the base CSS transition springs it back.
  }

  function onSwipeCancel() {
    releaseSwipe()
  }

  function replyTo(popup) {
    openMessagePanel({ id: popup.senderId, name: popup.name })
    dismissPopup(popup.key)
  }

  onDestroy(() => {
    if (channel) supabase.removeChannel(channel)
  })
</script>

{#if popups.length > 0}
  <div class="msg-popup-stack">
    {#each popups as popup (popup.key)}
      <div
        class="msg-popup"
        role="button"
        tabindex="0"
        style={popupStyle(popup)}
        on:click={() => {
          if (!consumeIfSwiped()) replyTo(popup)
        }}
        on:keydown={(e) => e.key === "Enter" && replyTo(popup)}
        on:pointerdown={(event) => onSwipeStart(event, popup)}
        on:pointermove={onSwipeMove}
        on:pointerup={onSwipeEnd}
        on:pointercancel={onSwipeCancel}
      >
        <div class="flex items-start gap-2.5">
          <span class="msg-popup-icon">
            <MessageSquare size={16} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="msg-popup-name">{popup.name}</p>
            {#if popup.attachmentLabel}
              <p class="msg-popup-attachment">📍 {popup.attachmentLabel}</p>
            {/if}
            {#if popup.body}
              <p class="msg-popup-body">{popup.body}</p>
            {/if}
          </div>
          <button
            class="msg-popup-close"
            on:click|stopPropagation={() => {
              if (!consumeIfSwiped()) dismissPopup(popup.key)
            }}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
        <div class="mt-1.5 flex items-center justify-end">
          <button
            class="msg-popup-reply"
            on:click|stopPropagation={() => {
              if (!consumeIfSwiped()) replyTo(popup)
            }}
          >
            <Reply size={12} /> Reply
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .msg-popup-stack {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 95;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(320px, calc(100vw - 24px));
  }

  .msg-popup {
    border-radius: 12px;
    border: 1px solid rgba(56, 189, 248, 0.28);
    background: rgba(10, 10, 12, 0.92);
    padding: 10px 12px;
    color: #fff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(10px);
    animation: msg-pop-in 0.18s ease-out;
  }

  @keyframes msg-pop-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .msg-popup-icon {
    display: flex;
    height: 26px;
    width: 26px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgba(56, 189, 248, 0.18);
    color: #7dd3fc;
  }

  .msg-popup-name {
    font-size: 12px;
    font-weight: 700;
  }

  .msg-popup-body {
    margin-top: 1px;
    font-size: 12px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.8);
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .msg-popup-attachment {
    margin-top: 1px;
    font-size: 12px;
    font-weight: 600;
    color: #7dd3fc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .msg-popup-close {
    display: flex;
    height: 22px;
    width: 22px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    color: rgba(255, 255, 255, 0.5);
  }

  .msg-popup-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .msg-popup-reply {
    display: flex;
    align-items: center;
    gap: 5px;
    border-radius: 8px;
    border: 1px solid rgba(56, 189, 248, 0.3);
    background: rgba(56, 189, 248, 0.14);
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    color: #7dd3fc;
  }

  .msg-popup-reply:hover {
    background: rgba(56, 189, 248, 0.26);
  }

  /* Whole card is tappable — opens the conversation. Swipe horizontally to
     dismiss; vertical panning still scrolls the stack. */
  .msg-popup {
    cursor: pointer;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    transition:
      transform 0.16s ease-out,
      opacity 0.16s ease-out;
  }

  .msg-popup:active {
    transform: scale(0.995);
  }

  /* Much easier to hit than the old 22px circle. */
  .msg-popup-close {
    height: 38px;
    width: 38px;
    margin: -8px -8px 0 0;
    border-radius: 10px;
  }
</style>
