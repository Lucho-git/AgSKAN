<script lang="ts">
  /**
   * Inviting someone onto the map, in one short card: who they are (a guest
   * who only looks, or one of the crew who joins for good), then the link on
   * one line with Copy beside it. Under that, Send (AgSKAN texts or emails
   * the invite for you, to a number or an address you give) and a QR code
   * for them to point a camera at.
   */
  import { createEventDispatcher } from "svelte"
  import {
    Check,
    Copy,
    LoaderCircle,
    Mail,
    MessageSquare,
    QrCode,
    RotateCcw,
    Send,
    X,
  } from "lucide-svelte"
  import { sendInvite } from "./liveData"

  export let farmName = ""
  /** The guest link, once it has been made. */
  export let guestLink: string | null = null
  /** The link that signs someone up and joins them to the farm. */
  export let teamLink = ""

  const dispatch = createEventDispatcher<{
    close: void
    /** Something to tell the person (a copy that didn't work). */
    say: string
  }>()

  let who: "guest" | "crew" = "guest"
  $: link = who === "guest" ? guestLink : teamLink

  let copied = false
  let copiedTimer: ReturnType<typeof setTimeout> | undefined
  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      copied = true
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => (copied = false), 2000)
    } catch {
      dispatch("say", "Couldn't copy it. Press and hold the link instead.")
    }
  }

  // What is open under the buttons: sending it, its QR code, or neither.
  let open: "send" | "qr" | null = null

  // ── Sending it for them ──
  let by: "text" | "email" = "text"
  let phone = ""
  let email = ""
  let sending = false
  /** Who it last went to, and by what. */
  let sent = ""
  let problem = ""
  $: to = by === "text" ? phone.replace(/[^\d+]/g, "") : email.trim()
  $: valid =
    by === "text"
      ? to.replace(/\D/g, "").length >= 8
      : /^\S+@\S+\.\S+$/.test(to)
  $: message =
    who === "guest"
      ? `You're invited to view "${farmName}" on AgSKAN.\n\nOpen this link to look at the map, no account needed:\n${link ?? ""}\n\nThe link works for a week.`
      : `You're invited to join "${farmName}" on AgSKAN.\n\nSign up with this link to join the farm:\n${link ?? ""}`
  // (The phone's own app, should ours not get it away.)
  $: own =
    by === "text"
      ? `sms:${encodeURIComponent(to)}?body=${encodeURIComponent(message)}`
      : `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Join ${farmName} on AgSKAN`)}&body=${encodeURIComponent(message)}`
  // A different link, way or person: what was said about the last is gone.
  $: if (link || by || to) problem = ""
  async function send() {
    if (!link || !valid || sending) return
    sending = true
    sent = ""
    problem = ""
    const went = to
    const wrong = await sendInvite(by, went, farmName, message)
    sending = false
    if (wrong) problem = wrong
    else {
      sent = `${by === "text" ? "Texted" : "Emailed"} to ${went}`
      if (by === "text") phone = ""
      else email = ""
    }
  }

  // The QR code is drawn by the same service the current viewer's invite
  // uses. (A number on the end gets a fresh try past a failed one.)
  let again = 0
  let drawn = ""
  let failed = false
  $: qrUrl = link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=L&data=${encodeURIComponent(link)}${again ? `&r=${again}` : ""}`
    : ""
  $: if (qrUrl !== drawn) failed = false
</script>

<div class="mn-card mn-menu mn-invite">
  <div class="top">
    <p class="lp-eyebrow">Invite to {farmName}</p>
    <button
      type="button"
      class="mn-icon-button"
      aria-label="Close"
      on:click={() => dispatch("close")}
    >
      <X size={22} />
    </button>
  </div>

  <div class="seg" role="tablist" aria-label="Who is being invited">
    <button
      type="button"
      role="tab"
      aria-selected={who === "guest"}
      on:click={() => (who = "guest")}
    >
      A guest
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={who === "crew"}
      on:click={() => (who = "crew")}
    >
      One of the crew
    </button>
  </div>
  <p class="what">
    {who === "guest"
      ? "Looks at the map, no account needed. The link works for a week."
      : "Signs up with this link and joins the farm for good."}
  </p>

  <!-- ── The link, and Copy beside it ── -->
  <div class="linkrow">
    {#if link}
      <span class="link" title={link}>
        <span>{link.replace(/^https?:\/\/(www\.)?/, "")}</span>
      </span>
    {:else}
      <span class="wait link">
        <span class="mn-spin"><LoaderCircle size={16} /></span> Making a link…
      </span>
    {/if}
    <button type="button" class="copy" disabled={!link} on:click={copy}>
      {#if copied}
        <Check size={17} strokeWidth={3} /> Copied
      {:else}
        <Copy size={17} /> Copy
      {/if}
    </button>
  </div>

  <div class="acts">
    <button
      type="button"
      class="go"
      disabled={!link}
      aria-pressed={open === "send"}
      on:click={() => (open = open === "send" ? null : "send")}
    >
      <Send size={18} /> Send
    </button>
    <button
      type="button"
      disabled={!link}
      aria-pressed={open === "qr"}
      on:click={() => (open = open === "qr" ? null : "qr")}
    >
      <QrCode size={18} /> QR code
    </button>
  </div>

  {#if open === "send" && link}
    <!-- ── AgSKAN sends it: a text or an email ── -->
    <form class="send" on:submit|preventDefault={send}>
      <div class="by" role="tablist" aria-label="How to send it">
        <button
          type="button"
          role="tab"
          aria-selected={by === "text"}
          on:click={() => (by = "text")}
        >
          <MessageSquare size={15} /> Text
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={by === "email"}
          on:click={() => (by = "email")}
        >
          <Mail size={15} /> Email
        </button>
      </div>
      <div class="to">
        {#if by === "text"}
          <input
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="Their mobile number"
            aria-label="Mobile number to text the invite to"
            bind:value={phone}
          />
        {:else}
          <input
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="Their email address"
            aria-label="Email address to send the invite to"
            bind:value={email}
          />
        {/if}
        <button type="submit" disabled={!valid || sending}>
          {#if sending}
            <span class="mn-spin"><LoaderCircle size={17} /></span>
          {:else}
            <Send size={16} />
          {/if}
          Send
        </button>
      </div>
      {#if sent}
        <p class="said ok"><Check size={15} strokeWidth={3} /> {sent}</p>
      {:else if problem}
        <p class="said">
          Couldn't send it: {problem}
          <a href={own}>
            Send from this phone's own {by === "text" ? "messages" : "mail"}
          </a>
        </p>
      {/if}
    </form>
  {:else if open === "qr" && qrUrl}
    <div class="qr">
      {#if failed}
        <button
          type="button"
          class="retry"
          on:click={() => {
            failed = false
            again += 1
          }}
        >
          <RotateCcw size={18} /> Couldn't draw it. Try again
        </button>
      {:else}
        {#key qrUrl}
          <img
            src={qrUrl}
            alt="QR code for the invite link"
            width="200"
            height="200"
            class:in={drawn === qrUrl}
            on:load={() => (drawn = qrUrl)}
            on:error={() => (failed = true)}
          />
        {/key}
      {/if}
      <span>Point a phone's camera at it</span>
    </div>
  {/if}
</div>

<style>
  .mn-invite {
    display: grid;
    gap: 8px;
    max-width: 24rem;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }
  .top .lp-eyebrow {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top .mn-icon-button {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    margin: -4px -6px -4px 0;
  }
  /* Who, and how to send: two halves of one control. */
  .seg,
  .by {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    padding: 3px;
    border-radius: 12px;
    background: var(--lp-paper);
    box-shadow: inset 0 0 0 1.5px var(--lp-line);
  }
  .seg button,
  .by button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    border-radius: 9px;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--lp-ink-soft);
  }
  .seg button[aria-selected="true"],
  .by button[aria-selected="true"] {
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  .what {
    font-size: 0.86rem;
    line-height: 1.35;
    color: var(--lp-ink-soft);
  }
  /* The link: one line of it, however long it is, and Copy at its end. */
  .linkrow {
    display: flex;
    gap: 6px;
    min-width: 0;
  }
  .link {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 12px;
    background: var(--lp-paper-2);
    font-family: var(--lp-mono);
    font-size: 0.76rem;
    color: var(--lp-ink);
    user-select: all;
  }
  .link span:not(.mn-spin) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link.wait {
    color: var(--lp-ink-soft);
  }
  .copy,
  .acts button,
  .to button {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 12px;
    background: var(--lp-paper);
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--lp-ink);
    white-space: nowrap;
  }
  .copy:hover:not(:disabled),
  .acts button:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .copy:disabled,
  .acts button:disabled,
  .to button:disabled {
    opacity: 0.5;
  }
  .acts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .acts button {
    min-height: 46px;
    border-radius: 14px;
  }
  .acts .go,
  .to button {
    border-color: #15261c;
    background: #f7db5c;
    font-weight: 800;
    color: #15261c;
  }
  .acts button[aria-pressed="true"] {
    border-color: var(--lp-ink);
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  /* Sending it for them. */
  .send {
    display: grid;
    gap: 6px;
    padding: 8px;
    border-radius: 14px;
    background: var(--lp-paper-2);
  }
  .to {
    display: flex;
    gap: 6px;
    min-width: 0;
  }
  .to input {
    flex: 1;
    width: 0;
    min-width: 0;
    min-height: 44px;
    padding: 0 12px;
    border: 1.5px solid var(--lp-line);
    border-radius: 12px;
    background: var(--lp-card);
    font-size: 1rem;
    color: var(--lp-ink);
  }
  .to input:focus {
    border-color: var(--lp-ink);
    outline: none;
  }
  .said {
    font-size: 0.82rem;
    line-height: 1.35;
    color: var(--lp-rust);
  }
  .said.ok {
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: 700;
    color: #1f8a4c;
  }
  .said a {
    display: block;
    font-weight: 700;
    color: var(--lp-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .qr {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 12px 12px 10px;
    border-radius: 14px;
    background: #fff;
    box-shadow: inset 0 0 0 1.5px var(--lp-line);
    font-size: 0.8rem;
    font-weight: 600;
    color: #4a5a50;
  }
  .qr img {
    width: min(200px, 52vw);
    height: auto;
    aspect-ratio: 1;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .qr img.in {
    opacity: 1;
  }
  .qr .retry {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 120px;
    font-weight: 700;
    color: #15261c;
  }
</style>
