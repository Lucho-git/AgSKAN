<script lang="ts">
  import { supabase } from "$lib/supabaseClient"
  import { MessageCircle, X, Send } from "lucide-svelte"

  export let show = false
  export let phone: string = ""
  export let ownerName: string = ""
  export let onClose: () => void = () => {}

  let message = ""
  let sending = false
  let sent = false
  let error = ""

  const SMS_FUNCTION =
    "https://hmxxqacnzxqpcheoeidn.supabase.co/functions/v1/send-sms"

  async function handleSend() {
    if (!message.trim()) return
    sending = true
    error = ""

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        error = "Not authenticated"
        sending = false
        return
      }

      const res = await fetch(SMS_FUNCTION, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phone, message: message.trim() }),
      })

      const body = await res.json()
      if (!res.ok) {
        error = body.error || `Error ${res.status}`
      } else {
        sent = true
        setTimeout(() => {
          message = ""
          sent = false
          onClose()
        }, 2000)
      }
    } catch (err: any) {
      error = err.message || "Failed to send"
    } finally {
      sending = false
    }
  }

  function handleClose() {
    if (!sending) {
      message = ""
      sent = false
      error = ""
      onClose()
    }
  }

  $: charCount = message.length
  $: canSend = message.trim().length > 0 && !sending && !sent
</script>

{#if show}
  <div class="modal modal-open" on:click={handleClose}>
    <div class="modal-box max-w-md" on:click|stopPropagation>
      <div class="mb-4 flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-lg font-semibold">
          <MessageCircle class="h-5 w-5 text-primary" />
          Send SMS
        </h3>
        <button
          type="button"
          class="btn btn-circle btn-ghost btn-sm"
          on:click={handleClose}
          disabled={sending}
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mb-4 rounded-lg bg-base-200 p-3 text-sm">
        <span class="text-contrast-content/60">To: </span>
        <span class="font-mono text-contrast-content">{phone}</span>
        {#if ownerName}
          <span class="text-contrast-content/50"> ({ownerName})</span>
        {/if}
        <br />
        <span class="text-xs text-contrast-content/40"
          >Sent from agskan alpha tag</span
        >
      </div>

      {#if sent}
        <div class="alert alert-success mb-4">
          <span>Message sent successfully!</span>
        </div>
      {:else}
        <div class="form-control mb-4">
          <textarea
            class="textarea textarea-bordered h-32 resize-none"
            placeholder="Type your message here..."
            bind:value={message}
            maxlength={500}
            disabled={sending}
          ></textarea>
          <label class="label">
            <span class="label-text-alt text-contrast-content/50"
              >{charCount}/500</span
            >
            {#if error}
              <span class="label-text-alt text-error">{error}</span>
            {/if}
          </label>
        </div>

        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="btn btn-ghost"
            on:click={handleClose}
            disabled={sending}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            on:click={handleSend}
            disabled={!canSend}
          >
            {#if sending}
              <span class="loading loading-spinner loading-sm"></span>
            {:else}
              <Send class="mr-1 h-4 w-4" />
            {/if}
            Send
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
