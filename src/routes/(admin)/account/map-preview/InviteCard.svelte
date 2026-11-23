<script lang="ts">
  /**
   * Inviting someone onto the map, in one short card: who they are (a guest
   * who only looks, or one of the crew who joins for good), the link on one
   * line, and three ways to hand it over: copy it, send it with the phone's
   * own share sheet, or show a QR code for them to point a camera at.
   */
  import { createEventDispatcher } from "svelte"
  import {
    Check,
    Copy,
    LoaderCircle,
    QrCode,
    RotateCcw,
    Send,
    X,
  } from "lucide-svelte"

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

  const canShare = typeof navigator !== "undefined" && "share" in navigator

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
  function send() {
    if (!link) return
    navigator
      .share?.({ title: `Join ${farmName} on AgSKAN`, url: link })
      .catch(() => {})
  }

  // The QR code is drawn by the same service the current viewer's invite
  // uses. (A number on the end gets a fresh try past a failed one.)
  let qr = false
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

  {#if link}
    <button type="button" class="link" title="Copy the link" on:click={copy}>
      <span>{link.replace(/^https?:\/\/(www\.)?/, "")}</span>
    </button>
  {:else}
    <p class="wait link">
      <span class="mn-spin"><LoaderCircle size={16} /></span> Making a link…
    </p>
  {/if}

  <div class="acts" class:two={!canShare}>
    <button type="button" class="go" disabled={!link} on:click={copy}>
      {#if copied}
        <Check size={18} strokeWidth={3} /> Copied
      {:else}
        <Copy size={18} /> Copy
      {/if}
    </button>
    {#if canShare}
      <button type="button" disabled={!link} on:click={send}>
        <Send size={18} /> Send
      </button>
    {/if}
    <button
      type="button"
      disabled={!link}
      aria-pressed={qr}
      on:click={() => (qr = !qr)}
    >
      <QrCode size={18} /> QR code
    </button>
  </div>

  {#if qr && qrUrl}
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
  /* Who: two halves of one control. */
  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    padding: 3px;
    border-radius: 12px;
    background: var(--lp-paper);
    box-shadow: inset 0 0 0 1.5px var(--lp-line);
  }
  .seg button {
    min-height: 36px;
    border-radius: 9px;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--lp-ink-soft);
  }
  .seg button[aria-selected="true"] {
    background: var(--lp-ink);
    color: var(--lp-paper);
  }
  .what {
    font-size: 0.86rem;
    line-height: 1.35;
    color: var(--lp-ink-soft);
  }
  /* The link: one line of it, however long it is. */
  .link {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 12px;
    background: var(--lp-paper-2);
    font-family: var(--lp-mono);
    font-size: 0.76rem;
    color: var(--lp-ink);
    text-align: left;
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
  .acts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .acts.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .acts button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 46px;
    padding: 0 6px;
    border: 1.5px solid var(--lp-line);
    border-radius: 14px;
    background: var(--lp-paper);
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--lp-ink);
    white-space: nowrap;
  }
  .acts button:hover:not(:disabled) {
    border-color: var(--lp-ink);
  }
  .acts button:disabled {
    opacity: 0.5;
  }
  .acts .go {
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
