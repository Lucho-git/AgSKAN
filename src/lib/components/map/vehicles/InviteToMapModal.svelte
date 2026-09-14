<!-- src/lib/components/map/vehicles/InviteToMapModal.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { X, Copy, Mail, MessageSquare, UserPlus, Loader2 } from "lucide-svelte"
  import { toast } from "svelte-sonner"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { supabase } from "$lib/stores/sessionStore"

  export let open = false

  const dispatch = createEventDispatcher()

  // Stub durations — once view-only invites ship, the token (not the client)
  // will define the real window; the exp param rides along for the server to
  // validate.
  const EXPIRY_OPTIONS = [
    { key: "24h", label: "24 hrs", hours: 24 },
    { key: "7d", label: "7 days", hours: 24 * 7 },
    { key: "30d", label: "30 days", hours: 24 * 30 },
  ]

  let expiryKey = "24h"
  let inviteToken = ""
  let createdKey = ""
  let generating = false
  let inviteWarning = ""
  let email = ""
  let phone = ""
  let retainAfterSignup = false
  let sendingSms = false
  let sendingEmail = false

  $: mapCode = $connectedMapStore?.join_code || $connectedMapStore?.id || ""
  $: mapName = $connectedMapStore?.map_name || "our farm map"

  $: expiry =
    EXPIRY_OPTIONS.find((option) => option.key === expiryKey) || EXPIRY_OPTIONS[1]

  // Mint a real invite (token + expiry live server-side). Falls back to a
  // local stub token if the RPC isn't available yet, so the modal keeps
  // working during rollout.
  $: desiredKey = `${expiryKey}|${retainAfterSignup ? 1 : 0}`

  $: if (
    open &&
    !generating &&
    mapCode &&
    (!inviteToken || createdKey !== desiredKey)
  ) {
    generateInvite()
  }

  $: if (!open) {
    inviteToken = ""
    createdKey = ""
    inviteWarning = ""
  }

  $: inviteLink = inviteToken
    ? `https://www.skanfarming.com.au/guest?invite=${inviteToken}`
    : ""

  async function generateInvite() {
    generating = true
    inviteWarning = ""
    try {
      let result = await supabase.rpc("create_map_invite", {
        p_role: "viewer",
        p_expires_hours: expiry.hours,
        p_access_hours: 48,
        p_retain_on_signup: retainAfterSignup,
      })
      // Until the retain-flag migration is applied the server function has no
      // such parameter — retry without it so invites keep working.
      if (
        result.error &&
        /function|schema cache|does not exist/i.test(result.error.message || "")
      ) {
        result = await supabase.rpc("create_map_invite", {
          p_role: "viewer",
          p_expires_hours: expiry.hours,
          p_access_hours: 48,
        })
      }
      if (result.error) throw result.error
      const row = Array.isArray(result.data) ? result.data[0] : result.data
      if (!row?.token) throw new Error("No invite token returned")
      inviteToken = row.token
    } catch (error) {
      console.warn(
        "create_map_invite failed — using a temporary local token:",
        error,
      )
      inviteToken = makeToken()
      inviteWarning =
        "Could not create a server invite — this link isn't time-limited yet."
    } finally {
      createdKey = `${expiryKey}|${retainAfterSignup ? 1 : 0}`
      generating = false
    }
  }
  $: messageBody = `You're invited to view "${mapName}" on AgSKAN.\n\nOpen this link to join — no account needed:\n${inviteLink}\n\nThe guest link is valid for ${expiry.label} and grants view-only access.`
  $: mailtoHref = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(`Join ${mapName} on AgSKAN`)}&body=${encodeURIComponent(messageBody)}`
  $: smsHref = `sms:${encodeURIComponent(phone.trim())}?body=${encodeURIComponent(messageBody)}`

  function makeToken() {
    return (
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 6)
    )
  }

  function copyLink() {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    toast.success("Invite link copied!")
  }

  function close() {
    dispatch("close")
  }

  // Email the invite via our Brevo-backed edge function; fall back to the
  // device's mail app when the function isn't deployed yet.
  async function sendEmail() {
    const address = email.trim()
    if (!address || !inviteLink || sendingEmail) return
    sendingEmail = true
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-invite-email",
        {
          body: {
            email: address,
            subject: `Join ${mapName} on AgSKAN`,
            message: messageBody,
          },
        },
      )
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success("Invite emailed", { description: `Sent to ${address}` })
    } catch (error) {
      console.warn("send-invite-email unavailable — opening mail app:", error)
      window.location.href = mailtoHref
    } finally {
      sendingEmail = false
    }
  }

  // Text the invite via our ClickSend-backed edge function; fall back to the
  // device's SMS app when the function isn't deployed yet.
  async function sendText() {
    const number = phone.trim()
    if (!number || !inviteLink || sendingSms) return
    sendingSms = true
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-invite-sms",
        { body: { phone: number, message: messageBody } },
      )
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success("Invite texted", { description: `Sent to ${number}` })
    } catch (error) {
      console.warn("send-invite-sms unavailable — opening SMS app:", error)
      window.location.href = smsHref
    } finally {
      sendingSms = false
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
    on:click={close}
  >
    <div
      class="invite-modal max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl bg-[#101013]/95 p-4 text-white shadow-2xl backdrop-blur-md"
      on:click|stopPropagation
    >
      <!-- Header -->
      <div class="flex items-start gap-3">
        <div
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/15"
        >
          <UserPlus size={16} class="text-blue-300" />
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="text-sm font-semibold text-white">Invite to map</h4>
          <p class="truncate text-xs text-white/50">{mapName}</p>
        </div>
        <button
          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          on:click={close}
          aria-label="Close"
          title="Close"
        >
          <X size={15} class="text-white/60" />
        </button>
      </div>

      {#if !mapCode}
        <p class="mt-4 text-xs text-white/60">
          Connect to a map first to generate invite links.
        </p>
      {:else}
        <!-- Invite link + duration -->
        <div class="mt-4">
          <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
            Invite link
          </div>
          <div class="flex gap-1.5">
            {#if generating && !inviteToken}
              <div
                class="invite-input flex min-w-0 flex-1 items-center gap-2 text-white/50"
              >
                <Loader2 size={12} class="animate-spin" /> Creating link…
              </div>
            {:else}
              <input
                type="text"
                readonly
                value={inviteLink}
                class="invite-input min-w-0 flex-1"
              />
            {/if}
            <button
              class="invite-icon-btn"
              on:click={copyLink}
              title="Copy link"
              disabled={!inviteLink}
              class:opacity-50={!inviteLink}
            >
              <Copy size={14} />
            </button>
          </div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="text-[10px] text-white/45">Link valid for</span>
            <div class="flex gap-1">
              {#each EXPIRY_OPTIONS as option (option.key)}
                <button
                  class="invite-chip {expiryKey === option.key ? 'active' : ''}"
                  on:click={() => (expiryKey = option.key)}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>
          <label class="invite-retain mt-2 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              class="mt-0.5"
              bind:checked={retainAfterSignup}
            />
            <span class="min-w-0">
              <span class="block text-[11px] font-medium text-white/80">
                Keep map access after they create an account
              </span>
              <span class="block text-[10px] leading-snug text-white/45">
                If the guest signs up for a real AgSKAN account, they stay on
                this map instead of losing access.
              </span>
            </span>
          </label>
          <p class="mt-1.5 text-[10px] text-white/40">
            Guests join with view-only access for 48 hours — no account
            needed.
          </p>
          {#if inviteWarning}
            <p class="mt-1 text-[10px] text-amber-300/80">{inviteWarning}</p>
          {/if}
        </div>

        <!-- Email -->
        <div class="mt-4">
          <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
            Send by email
          </div>
          <div class="flex gap-1.5">
            <input
              type="email"
              bind:value={email}
              placeholder="name@example.com"
              class="invite-input min-w-0 flex-1"
            />
            <button
              class="invite-send-btn"
              class:muted={!email.trim()}
              on:click={sendEmail}
              disabled={sendingEmail}
            >
              {#if sendingEmail}
                <Loader2 size={13} class="animate-spin" />
                Sending…
              {:else}
                <Mail size={13} />
                Email
              {/if}
            </button>
          </div>
        </div>

        <!-- Text -->
        <div class="mt-3">
          <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
            Send by text
          </div>
          <div class="flex gap-1.5">
            <input
              type="tel"
              bind:value={phone}
              placeholder="0400 000 000"
              class="invite-input min-w-0 flex-1"
            />
            <button
              class="invite-send-btn"
              class:muted={!phone.trim()}
              on:click={sendText}
              disabled={sendingSms}
            >
              {#if sendingSms}
                <Loader2 size={13} class="animate-spin" />
                Sending…
              {:else}
                <MessageSquare size={13} />
                Text
              {/if}
            </button>
          </div>
        </div>

        <p class="mt-4 rounded-lg bg-white/5 p-2.5 text-[10px] leading-relaxed text-white/50">
          Guests open the link and land on the map in seconds — no signup, no
          app install. They can see everything but can't add or change
          anything, and their access ends automatically.
        </p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .invite-input {
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.07);
    padding: 6px 9px;
    font-size: 12px;
    color: #fff;
    outline: none;
  }

  .invite-input:focus {
    border-color: rgba(96, 165, 250, 0.6);
  }

  .invite-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  .invite-icon-btn {
    display: flex;
    flex-shrink: 0;
    width: 34px;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.8);
    transition: background-color 0.15s ease;
  }

  .invite-icon-btn:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  .invite-chip {
    flex-shrink: 0;
    white-space: nowrap;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.65);
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .invite-chip:hover {
    background: rgba(255, 255, 255, 0.13);
  }

  .invite-chip.active {
    color: #fff;
    border-color: rgba(96, 165, 250, 0.55);
    background: rgba(96, 165, 250, 0.22);
  }

  .invite-send-btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 5px;
    border-radius: 8px;
    border: 1px solid rgba(16, 185, 129, 0.3);
    background: rgba(16, 185, 129, 0.14);
    padding: 6px 11px;
    font-size: 11px;
    font-weight: 600;
    color: #6ee7b7;
    transition: background-color 0.15s ease;
  }

  .invite-send-btn:hover {
    background: rgba(16, 185, 129, 0.26);
  }

  .invite-send-btn.muted {
    opacity: 0.5;
  }

  .invite-send-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .invite-retain input {
    accent-color: #60a5fa;
    width: 14px;
    height: 14px;
  }
</style>
