<script>
  import {
    Check,
    Copy,
    Share2,
    UserPlus,
    Phone,
    Mail,
    Link,
    X,
  } from "lucide-svelte"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"

  let mapIdCopied = false
  let linkCopied = false
  let showShareModal = false
  let shareType = ""
  let recipientInput = ""
  let open = false
  let showShareDropdown = false

  // Prevent background scroll when modal is open
  $: if (open || showShareModal) {
    document.body.style.overflow = "hidden"
  } else {
    document.body.style.overflow = ""
  }

  function openDialog() {
    open = true
  }

  function closeDialog() {
    open = false
    showShareDropdown = false
  }

  function copyMapId() {
    if ($connectedMapStore.id) {
      navigator.clipboard.writeText($connectedMapStore.id)
      mapIdCopied = true
      setTimeout(() => (mapIdCopied = false), 2000)
      toast.success("Map ID Copied to Clipboard")
    }
  }

  function copyLink() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`
    navigator.clipboard.writeText(shareUrl)
    linkCopied = true
    setTimeout(() => (linkCopied = false), 2000)
    toast.success("Link Copied to Clipboard")
  }

  function shareViaSMS() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`
    const messageText = `Join my SKAN farming map using this link: ${shareUrl}`
    const encodedMessage = encodeURIComponent(messageText)
    window.location.href = `sms:?&body=${encodedMessage}`
    showShareModal = false
  }

  function shareViaEmail() {
    const shareUrl = `https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`
    const emailSubject = "Join my SKAN farming map"
    const messageText = `Join my SKAN farming map using this link: ${shareUrl}`
    const encodedSubject = encodeURIComponent(emailSubject)
    const encodedBody = encodeURIComponent(messageText)
    window.location.href = `mailto:?subject=${encodedSubject}&body=${encodedBody}`
    showShareModal = false
  }

  function openShareModal(type) {
    shareType = type
    showShareModal = true
    showShareDropdown = false
    recipientInput = ""
  }

  function closeShareModal() {
    showShareModal = false
  }

  function toggleShareDropdown() {
    showShareDropdown = !showShareDropdown
  }

  function handleAgSKANSend() {
    toast.info("This feature is coming soon!")
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      closeDialog()
    }
  }

  function handleShareBackdropClick(event) {
    if (event.target === event.currentTarget) {
      closeShareModal()
    }
  }
</script>

<!-- Invite Button -->
<button class="btn btn-circle btn-primary btn-sm" on:click={openDialog}>
  <Icon icon="mdi:plus" width="24" height="24" />
</button>

<!-- Main Invite Modal -->
{#if open}
  <div
    class="fixed inset-0 flex items-start justify-center bg-black bg-opacity-80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    style="z-index: 9999;"
    on:click={handleBackdropClick}
  >
    <!-- Modal Content - Better responsive behavior -->
    <div
      class="flex h-screen w-full flex-col overflow-hidden rounded-none border-0 bg-base-100 shadow-2xl sm:h-auto sm:max-h-[90vh]
             sm:max-w-lg sm:rounded-xl sm:border sm:border-base-300"
      on:click|stopPropagation
    >
      <!-- Header with accent -->
      <div class="relative shrink-0">
        <div class="h-1 w-full bg-base-content"></div>
        <div
          class="flex items-center justify-between border-b border-base-300 p-5"
        >
          <h2
            class="flex items-center gap-2 text-xl font-bold text-base-content"
          >
            <UserPlus size={20} class="text-base-content" />
            Join AgSKAN Map
          </h2>
          <button
            on:click={closeDialog}
            class="rounded-full p-1.5 text-contrast-content transition-colors hover:bg-base-200 hover:text-base-content"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <!-- Subtitle -->
      <div class="shrink-0 px-6 pb-2 pt-4">
        <p class="text-sm text-contrast-content">Share your map with others</p>
      </div>

      <!-- Content - Flexible height -->
      <div class="flex-1 overflow-y-auto px-6 py-4">
        <div class="flex flex-col items-center">
          <div class="mb-6 rounded-full bg-base-content/10 p-4">
            <Icon
              icon="mdi:account-group"
              class="h-12 w-12 text-base-content"
            />
          </div>

          <!-- Copy Options Container -->
          <div class="w-full space-y-6">
            <!-- Map ID Section -->
            <div class="rounded-lg border border-base-300 bg-base-200 p-4">
              <h4 class="mb-3 text-base font-semibold text-base-content">
                Map ID
              </h4>
              <div class="flex gap-2">
                <input
                  type="text"
                  class="flex-1 rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm font-medium text-contrast-content outline-none focus:border-base-content"
                  value={$connectedMapStore.id}
                  readonly
                />
                <button
                  class="flex items-center justify-center rounded-lg bg-base-content px-3 py-2 text-base-100 transition-colors hover:bg-base-content/90"
                  on:click={copyMapId}
                >
                  {#if mapIdCopied}
                    <Check size={18} />
                  {:else}
                    <Copy size={18} />
                  {/if}
                </button>
              </div>
              <p class="mt-3 text-xs text-contrast-content">
                Share this ID with other users to join your map
              </p>
            </div>

            <!-- Share Link Section -->
            <div class="rounded-lg border border-base-300 bg-base-200 p-4">
              <h4 class="mb-3 text-base font-semibold text-base-content">
                Share Link
              </h4>
              <div class="flex gap-2">
                <input
                  type="text"
                  class="flex-1 break-all rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm font-medium text-contrast-content outline-none focus:border-base-content"
                  value={`https://www.skanfarming.com.au/login?map_id=${$connectedMapStore.id}`}
                  readonly
                />
                <button
                  class="flex items-center justify-center rounded-lg bg-base-content px-3 py-2 text-base-100 transition-colors hover:bg-base-content/90"
                  on:click={copyLink}
                >
                  {#if linkCopied}
                    <Check size={18} />
                  {:else}
                    <Link size={18} />
                  {/if}
                </button>
              </div>
              <p class="mt-3 text-xs text-contrast-content">
                Share this link for direct access to your map
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer with actions -->
      <div class="shrink-0 border-t border-base-300 p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="relative">
            <button
              class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-sm text-base-content transition-colors hover:bg-base-300"
              on:click={toggleShareDropdown}
            >
              <Share2 size={16} />
              Share
            </button>

            {#if showShareDropdown}
              <div
                class="absolute bottom-full left-0 z-10 mb-2 min-w-max overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-lg"
              >
                <button
                  class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-base-200"
                  on:click={() => openShareModal("phone")}
                >
                  <Phone size={16} /> Via Phone
                </button>
                <button
                  class="flex w-full items-center gap-2 border-t border-base-300 px-4 py-3 text-left text-sm transition-colors hover:bg-base-200"
                  on:click={() => openShareModal("email")}
                >
                  <Mail size={16} /> Via Email
                </button>
              </div>
            {/if}
          </div>
          <button
            on:click={closeDialog}
            class="w-full rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
          >
            Close
          </button>
        </div>
      </div>

      <!-- Decorative icons -->
      <div class="absolute right-2 top-2 text-base-content opacity-20">
        <Icon icon="mdi:leaf" class="h-5 w-5" />
      </div>
      <div class="absolute bottom-2 left-2 text-base-content opacity-20">
        <Icon icon="mdi:nature" class="h-5 w-5" />
      </div>
    </div>
  </div>
{/if}

<!-- Share Method Selection Modal -->
{#if showShareModal}
  <div
    class="fixed inset-0 flex items-start justify-center bg-black bg-opacity-80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    style="z-index: 10000;"
    on:click={handleShareBackdropClick}
  >
    <!-- Modal Content -->
    <div
      class="flex h-screen w-full flex-col overflow-hidden rounded-none border-0 bg-base-100 shadow-2xl sm:h-auto sm:max-h-[90vh]
             sm:max-w-md sm:rounded-xl sm:border sm:border-base-300"
      on:click|stopPropagation
    >
      <!-- Header with accent -->
      <div class="relative shrink-0">
        <div class="h-1 w-full bg-primary"></div>
        <div
          class="flex items-center justify-between border-b border-base-300 p-5"
        >
          <h2
            class="flex items-center gap-2 text-xl font-bold text-base-content"
          >
            {#if shareType === "phone"}
              <Phone size={20} class="text-base-content" />
            {:else}
              <Mail size={20} class="text-base-content" />
            {/if}
            Share via {shareType === "phone" ? "Phone" : "Email"}
          </h2>
          <button
            on:click={closeShareModal}
            class="rounded-full p-1.5 text-contrast-content transition-colors hover:bg-base-200 hover:text-base-content"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <!-- Content - Flexible height -->
      <div class="flex-1 overflow-y-auto px-6 py-6">
        <div class="space-y-6">
          <!-- You Send Option -->
          <div class="rounded-lg border border-base-300 bg-base-200 p-4">
            <h4 class="mb-3 text-base font-semibold text-base-content">
              Share Directly
            </h4>
            <div class="space-y-3">
              <button
                class="w-full rounded-lg bg-base-content px-4 py-2 text-base-100 transition-colors hover:bg-base-content/90"
                on:click={shareType === "phone" ? shareViaSMS : shareViaEmail}
              >
                Share via Your {shareType === "phone" ? "Phone" : "Email"}
              </button>
              <p class="text-center text-xs text-contrast-content">
                Opens your default {shareType === "phone"
                  ? "messaging"
                  : "email"} app
              </p>
            </div>
          </div>

          <div class="divider text-xs text-contrast-content">OR</div>

          <!-- AgSKAN Sends Option -->
          <div class="rounded-lg border border-base-300 bg-base-200 p-4">
            <h4 class="mb-3 text-base font-semibold text-base-content">
              Let AgSKAN Share
            </h4>
            <div class="space-y-3">
              <div class="relative">
                {#if shareType === "email"}
                  <input
                    type="email"
                    placeholder="Enter email address"
                    class="w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm text-contrast-content opacity-50"
                    bind:value={recipientInput}
                    disabled
                  />
                {:else}
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    class="w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm text-contrast-content opacity-50"
                    bind:value={recipientInput}
                    disabled
                  />
                {/if}
                <div
                  class="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-warning px-2 py-1 text-xs text-warning-content"
                >
                  Coming Soon
                </div>
              </div>
              <button
                class="w-full rounded-lg border border-base-300 bg-base-200 px-4 py-2 text-contrast-content opacity-50 transition-colors"
                on:click={handleAgSKANSend}
                disabled
              >
                Send via AgSKAN
              </button>
              <p class="text-center text-xs text-contrast-content">
                We'll send it directly to the recipient
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="shrink-0 border-t border-base-300 p-4">
        <button
          on:click={closeShareModal}
          class="w-full rounded-lg bg-base-200 px-4 py-3 text-contrast-content transition-colors hover:bg-base-300"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
