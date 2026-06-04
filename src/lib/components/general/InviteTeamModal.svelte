<script lang="ts">
  import { UserPlus, X } from "lucide-svelte"
  import InviteTeamFields from "$lib/components/general/InviteTeamFields.svelte"

  export let open = false

  function close() {
    open = false
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="presentation"
  >
    <div
      class="dashboard-slide-down max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-base-100 p-5 shadow-xl sm:p-6"
      on:click|stopPropagation
      role="dialog"
      aria-modal="true"
    >
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/20 sm:h-10 sm:w-10"
          >
            <UserPlus class="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
          </div>
          <div>
            <h4
              class="text-base font-semibold text-contrast-content sm:text-lg"
            >
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

      <div class="space-y-4 sm:space-y-5">
        <InviteTeamFields />
      </div>
    </div>
  </div>
{/if}

<style>
  .dashboard-slide-down {
    animation: dashboard-slide-down 0.2s ease-out;
  }

  @keyframes dashboard-slide-down {
    from {
      opacity: 0;
      transform: translateY(-12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
