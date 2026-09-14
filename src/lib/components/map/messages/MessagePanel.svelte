<!-- src/lib/components/map/messages/MessagePanel.svelte -->
<!-- Conversation with one person, opened from the people/vehicles menu. -->
<script>
  import { onMount, onDestroy, tick } from "svelte"
  import { get } from "svelte/store"
  import { Send, X, Loader2 } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import {
    messagePanelStore,
    messageTickStore,
    closeMessagePanel,
    messageClearUnread,
  } from "$lib/stores/messageStore"
  import { mapPresenceStore } from "$lib/stores/mapPresenceStore"
  import {
    fetchConversation,
    markConversationRead,
    sendMapMessage,
  } from "$lib/api/messagesApi"

  /** @type {{ id: string, name: string } | null} */
  let recipient = null
  let messages = []
  let loading = false
  let sending = false
  let draft = ""
  /** @type {HTMLElement | null} */
  let listEl = null
  let unsubs = []

  $: me = $profileStore?.id || null
  $: mapId = $profileStore?.master_map_id || null
  $: myName = $profileStore?.full_name || "Someone"
  $: recipientOnline = recipient ? $mapPresenceStore.has(recipient.id) : false

  onMount(() => {
    unsubs.push(
      messagePanelStore.subscribe((r) => {
        recipient = r
        if (r) {
          draft = ""
          refresh(true)
        }
      }),
    )
    // A new message arrived (any conversation) — refresh if it's ours.
    unsubs.push(
      messageTickStore.subscribe(() => {
        if (get(messagePanelStore)) refresh(false)
      }),
    )
    return () => unsubs.forEach((u) => u())
  })

  onDestroy(() => {
    unsubs.forEach((u) => u())
  })

  async function refresh(markRead) {
    const target = recipient
    if (!target || !me || !mapId) return
    loading = true
    try {
      const rows = await fetchConversation(mapId, me, target.id)
      // Ignore results if the panel moved on to someone else mid-flight.
      if (recipient?.id !== target.id) return
      messages = rows
      if (markRead) {
        await markConversationRead(mapId, me, target.id)
        messageClearUnread(target.id)
      }
      await tick()
      if (listEl) listEl.scrollTop = listEl.scrollHeight
    } catch (error) {
      console.warn("Conversation load failed:", error)
    } finally {
      loading = false
    }
  }

  async function send() {
    const body = draft.trim()
    const target = recipient
    if (!body || !target || !me || !mapId || sending) return
    sending = true
    try {
      await sendMapMessage({
        masterMapId: mapId,
        senderId: me,
        senderName: myName,
        recipientId: target.id,
        body,
      })
      draft = ""
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

{#if recipient}
  <div class="msg-panel">
    <!-- Header -->
    <div class="msg-panel-head">
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-bold text-white">{recipient.name}</p>
        <p class="mt-0.5 flex items-center gap-1.5 text-[10px]">
          <span
            class="inline-block h-1.5 w-1.5 rounded-full {recipientOnline
              ? 'bg-emerald-400'
              : 'bg-white/30'}"
          ></span>
          <span class={recipientOnline ? "text-emerald-300" : "text-white/40"}>
            {recipientOnline ? "Online" : "Offline"}
          </span>
        </p>
      </div>
      <button
        class="msg-panel-close"
        on:click={closeMessagePanel}
        aria-label="Close messages"
        title="Close"
      >
        <X size={14} />
      </button>
    </div>

    <!-- Conversation -->
    <div class="msg-panel-list" bind:this={listEl}>
      {#if loading && messages.length === 0}
        <div class="flex items-center justify-center gap-2 py-8 text-white/50">
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
            <div class="msg-bubble {mine ? 'mine' : ''}">{msg.body}</div>
            <span class="msg-time">{formatTime(msg.created_at)}</span>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Composer -->
    {#if !recipientOnline}
      <p class="msg-offline-hint">
        They're offline — your message will also send as a phone notification.
      </p>
    {/if}
    <div class="msg-panel-input">
      <textarea
        rows="1"
        placeholder="Message {recipient.name}…"
        bind:value={draft}
        on:keydown={onKeydown}
        maxlength="500"
      ></textarea>
      <button
        class="msg-send-btn"
        on:click={send}
        disabled={sending || !draft.trim()}
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
</style>
