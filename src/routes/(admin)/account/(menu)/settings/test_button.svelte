<script lang="ts">
  import { toast } from "svelte-sonner" // Make sure to import toast
  let isChecking = false

  export let data

  // Function to show a simple toast message
  const showTestToast = () => {
    isChecking = true

    // Show toast with developer information
    toast.success("Test Button Pressed", {
      description: "This is a developer testing feature",
      duration: 3000,
    })

    // Simulate some activity
    setTimeout(() => {
      isChecking = false
    }, 1000)
  }

  /**
   * DEVELOPER TESTING ZONE
   *
   * Set this to true to show the test button
   */
  const SHOW_TEST_BUTTON = false // Change to true to enable the button
</script>

{#if SHOW_TEST_BUTTON}
  <div class="fixed bottom-8 left-8 z-50">
    <button
      on:click={showTestToast}
      class="btn btn-circle btn-primary btn-lg"
      disabled={isChecking}
      title="Developer Test Button"
    >
      {#if isChecking}
        <span
          class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
        ></span>
      {:else}
        <i class="at-debug" />
      {/if}
    </button>
  </div>
{/if}
