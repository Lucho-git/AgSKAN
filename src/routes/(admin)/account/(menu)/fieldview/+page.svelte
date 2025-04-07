<!-- src/routes/admin/fieldview/+page.svelte -->
<script lang="ts">
  import { getContext } from "svelte"
  import type { Writable } from "svelte/store"
  import FileUpload from "./FileUpload.svelte"
  import FileUploadDashboard from "./FileUploadDashboard.svelte"
  import FieldsOverview from "./FieldsOverview.svelte"
  import {
    Info,
    FileUp,
    Loader,
    Upload,
    Plus,
    HelpCircle,
    ExternalLink,
  } from "lucide-svelte"
  import { userFilesStore } from "./userFilesStore"
  import { fieldStore } from "../../../../../stores/fieldStore"
  import { session } from "$lib/stores/sessionStore"
  import { browser } from "$app/environment"

  // Import shadcn-svelte components
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert"
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
  } from "$lib/components/ui/card"
  import { Separator } from "$lib/components/ui/separator"
  import { Button } from "$lib/components/ui/button"

  // Get page data
  export let data

  // Retrieve and set the admin section context
  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("fieldview")

  // Set up loading state
  let loading = data.loading
  let error = data.error

  // Upload popover state
  let isPopoverOpen = false
  let infoModalId = "boundary-help-modal"

  function togglePopover() {
    isPopoverOpen = !isPopoverOpen
  }

  function handlePopoverClose() {
    isPopoverOpen = false
  }

  function openInfoModal() {
    const modal = document.getElementById(infoModalId) as HTMLDialogElement
    if (modal) modal.showModal()
  }

  function closeInfoModal() {
    const modal = document.getElementById(infoModalId) as HTMLDialogElement
    if (modal) modal.close()
  }

  // Update stores when data changes
  $: if (data.files && !loading) {
    userFilesStore.set(data.files)
  }

  $: if (data.fields && !loading) {
    fieldStore.set(data.fields)
  }

  // Sample FAQ items
  const faqItems = [
    {
      question: "What are field boundaries?",
      answer:
        "Field boundaries are digital outlines of your farm paddocks or fields. They define the exact perimeter of each area you manage on your farm.",
    },
    {
      question: "What file formats are supported?",
      answer:
        "We support Shapefiles (zipped), KML files, and ISOXML files. These are standard formats used in agriculture and mapping software.",
    },
    {
      question: "How do I export boundaries from John Deere Operations Center?",
      answer:
        "From Operations Center, go to the Map View, select the field(s) you want to export, click 'Export', and choose 'Shapefile' format. Download the ZIP file, which you can then upload to our system.",
    },
    {
      question: "How do I export boundaries from Climate FieldView?",
      answer:
        "In FieldView, open the Fields section, select the field(s) you want to export, tap the share icon, and select 'Export as KML'. You can then upload this KML file directly to our system.",
    },
    {
      question: "How do I get boundaries if they're not in a digital system?",
      answer:
        "If your boundaries aren't already in a digital system, you can create them using free tools like Google Earth (for KML files) or QGIS (for shapefiles). Our support team can also help you get started.",
    },
  ]
</script>

{#if browser}
  <div class="container mx-auto space-y-8 py-6">
    <div
      class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
    >
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Field Management</h2>
        <p class="max-w-3xl text-muted-foreground">
          Upload field boundaries, manage your fields, and view field data all
          in one place.
        </p>
      </div>

      <!-- Help button moved to page header -->
      <button
        class="btn btn-outline gap-2 self-start"
        on:click={openInfoModal}
        aria-label="Help with field boundaries"
      >
        <HelpCircle class="h-4 w-4" />
        <span class="whitespace-nowrap">Help with field boundaries</span>
      </button>
    </div>

    <Separator class="my-6" />

    {#if loading}
      <div class="flex h-64 w-full items-center justify-center">
        <Loader class="h-12 w-12 animate-spin text-primary" />
        <span class="ml-4 text-lg">Loading field data...</span>
      </div>
    {:else if error}
      <Alert variant="destructive">
        <Info class="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load data: {error}</AlertDescription>
      </Alert>
    {:else if !$session?.user?.id}
      <Alert variant="warning">
        <Info class="h-4 w-4" />
        <AlertTitle>Session Expired</AlertTitle>
        <AlertDescription
          >Your session has expired. Please <a
            href="/login"
            class="font-medium underline underline-offset-4">log in</a
          > again.</AlertDescription
        >
      </Alert>
    {:else}
      <!-- Upload Section - Now a clickable card -->
      <div
        class="cursor-pointer transition-all duration-200 hover:opacity-90"
        on:click={togglePopover}
        on:keydown={(e) => e.key === "Enter" && togglePopover()}
        tabindex="0"
        role="button"
        aria-label="Upload field boundaries"
      >
        <Card
          class="border-2 border-dashed border-primary/20 bg-primary/5 hover:bg-primary/10"
        >
          <div
            class="flex flex-col items-center justify-center p-8 text-center"
          >
            <div class="mb-4 rounded-full bg-primary/10 p-3">
              <Upload class="h-8 w-8 text-primary" />
            </div>
            <h3 class="mb-2 text-xl font-medium">Upload Field Boundaries</h3>
            <p class="max-w-xs text-sm text-muted-foreground">
              Click here to upload your paddock boundaries
            </p>
          </div>
        </Card>
      </div>

      <!-- Upload Dialog Component -->
      <FileUpload {isPopoverOpen} on:close={handlePopoverClose} />

      <!-- Information Modal using Daisy UI modal approach with desktop width only -->
      <dialog id={infoModalId} class="modal modal-bottom sm:modal-middle">
        <div class="desktop-wider mobile-fix modal-box">
          <h3 class="mb-1 text-xl font-bold">Field Boundary Help</h3>
          <p class="mb-4 text-sm opacity-70">
            Learn about field boundaries and how to export them from your
            existing systems.
          </p>

          <div class="mb-6">
            <div
              class="mb-4 flex aspect-video items-center justify-center rounded-lg bg-base-300"
            >
              <!-- Placeholder for video -->
              <div class="p-4 text-center">
                <ExternalLink class="mx-auto mb-2 h-12 w-12 opacity-40" />
                <p>Video tutorial placeholder</p>
                <p class="text-xs opacity-70">
                  This would link to an informative YouTube video about
                  exporting field boundaries
                </p>
              </div>
            </div>

            <p class="mb-4">
              Field boundaries define the exact perimeter of each paddock on
              your farm. Our system accepts boundaries from most major farm
              management platforms, including John Deere Operations Center,
              Climate FieldView, and more.
            </p>
          </div>

          <h4 class="mb-2 text-lg font-bold">
            Export Instructions & Common Questions
          </h4>

          <!-- FAQ Accordion using Daisy UI -->
          <div class="join join-vertical w-full">
            {#each faqItems as faq, i}
              <div
                class="collapse join-item collapse-arrow border border-base-300"
              >
                <input type="radio" name="faq-accordion" checked={i === 0} />
                <div class="collapse-title font-medium">
                  {faq.question}
                </div>
                <div class="collapse-content">
                  <p>{faq.answer}</p>
                </div>
              </div>
            {/each}
          </div>

          <div class="mt-6 space-y-2">
            <h4 class="font-bold">Helpful Resources</h4>
            <ul class="list-disc space-y-1 pl-5 text-sm">
              <li>
                <a href="#" class="text-primary hover:underline"
                  >Download our field boundary export guide (PDF)</a
                >
              </li>
              <li>
                <a href="#" class="text-primary hover:underline"
                  >Video: Exporting from common farm management systems</a
                >
              </li>
              <li>
                <a href="#" class="text-primary hover:underline"
                  >Contact our support team for assistance</a
                >
              </li>
            </ul>
          </div>

          <div class="modal-action">
            <button
              class="btn btn-primary"
              on:click={() => {
                closeInfoModal()
                togglePopover()
              }}
            >
              Upload My Boundaries
            </button>
            <button class="btn" on:click={closeInfoModal}>Close</button>
          </div>
        </div>

        <!-- This is the modal backdrop that dims and blocks the screen -->
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <!-- File Upload Dashboard -->
      <div>
        <FileUploadDashboard />
      </div>

      <!-- Fields Overview -->
      <div>
        <FieldsOverview />
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Add a subtle pulsing effect to draw attention to the upload card */
  @keyframes gentle-pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(var(--primary), 0.1);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(var(--primary), 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(var(--primary), 0);
    }
  }

  :global(.new-user) .border-primary {
    animation: gentle-pulse 2s infinite;
  }

  /* Desktop-only width enhancement */
  @media (min-width: 768px) {
    .desktop-wider {
      width: 800px;
      max-width: 90%;
    }
  }

  /* Mobile bottom spacing fix without changing horizontal alignment */
  @media (max-width: 640px) {
    /* Add padding at the bottom of modal content to prevent button cutoff */
    .mobile-fix {
      padding-bottom: 5rem;
    }

    /* Adjust modal container positioning */
    .modal.modal-bottom {
      padding-bottom: 2rem;
    }
  }
</style>
