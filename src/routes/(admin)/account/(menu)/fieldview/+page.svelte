<!-- src/routes/admin/fieldview/+page.svelte -->
<script lang="ts">
  import { getContext } from "svelte"
  import type { Writable } from "svelte/store"
  import UploadPopoverTrigger from "./UploadPopoverTrigger.svelte"
  import FileUploadDashboard from "./FileUploadDashboard.svelte"
  import FieldsOverview from "./FieldsOverview.svelte"
  import { Info, FileUp, Loader } from "lucide-svelte"
  import { userFilesStore } from "../../../../../stores/userFilesStore"
  import { fieldStore } from "../../../../../stores/fieldStore"
  import { session } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"

  // Get page data
  export let data

  // Retrieve and set the admin section context
  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("fieldview")

  // Set up loading state
  let loading = data.loading
  let error = data.error

  // Update stores when data changes
  $: if (data.files && !loading) {
    userFilesStore.set(data.files)
  }

  $: if (data.fields && !loading) {
    fieldStore.set(data.fields)
  }
</script>

{#if browser}
  <div class="app-container">
    <div class="mx-auto w-full">
      <h2 class="mb-6 text-3xl font-bold">FieldView</h2>

      {#if loading}
        <div class="flex h-64 w-full items-center justify-center">
          <Loader class="h-12 w-12 animate-spin text-primary" />
          <span class="ml-4 text-lg">Loading field data...</span>
        </div>
      {:else if error}
        <div class="alert alert-error mb-6">
          <Info class="h-6 w-6" />
          <span>Error loading data: {error}</span>
        </div>
      {:else if !$session?.user?.id}
        <div class="alert alert-warning mb-6">
          <Info class="h-6 w-6" />
          <span
            >Your session has expired. Please <a href="/login" class="underline"
              >log in</a
            > again.</span
          >
        </div>
      {:else}
        <!-- Upload Section -->
        <div class="alert alert-success mb-6 flex items-start">
          <FileUp class="mr-2 mt-4 h-14 w-14" />

          <div>
            <div class="font-bold">Upload Paddock Boundaries</div>
            <div class="my-2">
              <UploadPopoverTrigger />
            </div>
          </div>
        </div>

        <!-- File Upload Dashboard -->
        <div class="mb-6">
          <FileUploadDashboard />
        </div>

        <!-- Fields Overview -->
        <div class="mb-6">
          <FieldsOverview />
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .app-container {
    display: flex;
    width: 100%;
    min-height: 100vh;
  }
</style>
