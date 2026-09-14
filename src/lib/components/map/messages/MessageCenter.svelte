<!-- src/lib/components/map/messages/MessageCenter.svelte -->
<!-- Listens for incoming messages, shows in-app popups + unread badges. -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { MessageSquare, Reply, X } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    messagePanelStore,
    messageBumpUnread,
    messageSetUnread,
    messageBumpTick,
    openMessagePanel,
  } from "$lib/stores/messageStore"
  import { fetchUnreadBySender } from "$lib/api/messagesApi"

  let me = null
  let mapId = null
  let channel = null
  /** @type {{ key: number, senderId: string, name: string, body: string }[]} */
  let popups = []
  let popupSeq = 0

  $: me = $profileStore?.id || null
  $: mapId = $profileStore?.master_map_id || null

  let panelUnsub = null

  onMount(() => {
    // Opening the panel for someone dismisses their popups (the panel marks
    // the conversation read).
    panelUnsub = messagePanelStore.subscribe((panel) => {
      if (!panel) return
      popups = popups.filter((p) => p.senderId !== panel.id)
    })
    return () => panelUnsub?.()
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
          const panel = get(messagePanelStore)
          if (panel && panel.id === msg.sender_id) return // actively chatting

          messageBumpUnread(msg.sender_id)
          addPopup(msg)
        },
      )
      .subscribe()
  }

  function addPopup(msg) {
    const key = ++popupSeq
    popups = [
      ...popups.slice(-2),
      {
        key,
        senderId: msg.sender_id,
        name: msg.sender_name || "Team member",
        body: msg.body,
      },
    ]
    setTimeout(() => dismissPopup(key), 30000)
  }

  function dismissPopup(key) {
    popups = popups.filter((p) => p.key !== key)
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
      <div class="msg-popup">
        <div class="flex items-start gap-2.5">
          <span class="msg-popup-icon">
            <MessageSquare size={14} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="msg-popup-name">{popup.name}</p>
            <p class="msg-popup-body">{popup.body}</p>
          </div>
          <button
            class="msg-popup-close"
            on:click={() => dismissPopup(popup.key)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
        <div class="mt-2 flex justify-end">
          <button class="msg-popup-reply" on:click={() => replyTo(popup)}>
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
</style>
