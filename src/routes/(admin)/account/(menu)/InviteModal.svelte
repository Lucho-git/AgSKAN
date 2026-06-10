<script lang="ts">
  import Icon from "@iconify/svelte"
  import InviteTeamModal from "$lib/components/general/InviteTeamModal.svelte"

  export let overLimit = false
  export let overLimitCount = 0
  export let isOwner = false
  export let onBillingClick: (() => void) | null = null
  let open = false
</script>

<!-- Invite Button -->
{#if $$slots.trigger}
  <span
    class="contents"
    role="button"
    tabindex="-1"
    on:click={() => (open = true)}
    on:keydown={(e) => (e.key === "Enter" || e.key === " ") && (open = true)}
  >
    <slot name="trigger" />
  </span>
{:else}
  <button
    class="btn btn-circle btn-primary btn-sm"
    on:click={() => (open = true)}
  >
    <Icon icon="mdi:plus" width="24" height="24" />
  </button>
{/if}

<InviteTeamModal bind:open {overLimit} {overLimitCount} {isOwner} {onBillingClick} />
