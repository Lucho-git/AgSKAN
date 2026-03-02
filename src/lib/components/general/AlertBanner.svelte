<!-- src/lib/components/general/AlertBanner.svelte -->
<script lang="ts">
  export let title: string
  export let description: string
  export let link: string | null = null
</script>

<div class="mx-auto mb-6 w-full max-w-4xl">
  <div
    class="alert flex items-center bg-gradient-to-r from-secondary to-accent text-secondary-content transition-all duration-300 ease-in-out {link
      ? 'hover:from-secondary-focus hover:to-accent-focus cursor-pointer'
      : ''}"
    on:click={() => {
      if (link) {
        window.location.href = link
      }
    }}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      class="hidden h-6 w-6 shrink-0 stroke-current sm:block"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      ></path>
    </svg>
    <div class="flex-grow">
      <h3 class="font-bold">{title}</h3>
      <div class="text-sm">
        {description}
      </div>
    </div>
    {#if link}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="ml-2 h-6 w-6 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M14 5l7 7m0 0l-7 7m7-7H3"
        />
      </svg>
    {/if}
  </div>
</div>
