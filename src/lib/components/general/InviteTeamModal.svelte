<script lang="ts">
  import {
    UserPlus,
    X,
    AlertTriangle,
    ChevronRight,
    ExternalLink,
  } from "lucide-svelte"
  import InviteTeamFields from "$lib/components/general/InviteTeamFields.svelte"

  export let open = false
  export let overLimit = false
  export let overLimitCount = 0
  export let isOwner = false
  export let onBillingClick: (() => void) | null = null

  let dialogEl: HTMLDialogElement

  $: if (open && dialogEl && !dialogEl.open) {
    dialogEl.showModal()
  } else if (!open && dialogEl?.open) {
    dialogEl.close()
  }

  function close() {
    open = false
  }
</script>

<dialog bind:this={dialogEl} class="modal modal-middle" on:close={close}>
  <div class="modal-box max-h-[90vh] w-full max-w-md overflow-y-auto">
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/20 sm:h-10 sm:w-10"
        >
          <UserPlus class="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
        </div>
        <div>
          <h4 class="text-base font-semibold text-contrast-content sm:text-lg">
            Invite Team
          </h4>
          <p class="text-xs text-contrast-content/60 sm:text-sm">
            Share your map with team members
          </p>
        </div>
      </div>
      <button
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300"
        on:click={close}
        title="Close"
      >
        <X class="h-4 w-4 text-contrast-content/60" />
      </button>
    </div>

    {#if overLimit}
      <div
        class="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 {isOwner &&
        onBillingClick
          ? 'cursor-pointer transition-colors hover:bg-red-500/10'
          : ''}"
        on:click={() => isOwner && onBillingClick?.()}
        role={isOwner && onBillingClick ? "button" : undefined}
        tabindex={isOwner && onBillingClick ? 0 : undefined}
        on:keydown={(e) =>
          isOwner &&
          onBillingClick &&
          (e.key === "Enter" || e.key === " ") &&
          onBillingClick()}
      >
        <div class="flex items-start gap-2.5">
          <AlertTriangle class="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <p class="flex-1 text-sm text-contrast-content">
            You're {overLimitCount} seat{overLimitCount === 1 ? "" : "s"} over your
            plan limit.
          </p>
          {#if isOwner && onBillingClick}
            <ExternalLink
              class="mt-0.5 h-4 w-4 flex-shrink-0 text-contrast-content/40"
            />
          {/if}
        </div>
      </div>
    {/if}

    <div class="space-y-4 sm:space-y-5">
      <InviteTeamFields />
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
