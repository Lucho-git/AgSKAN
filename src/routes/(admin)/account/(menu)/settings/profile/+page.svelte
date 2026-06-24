<script lang="ts">
  import { session } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { X } from "lucide-svelte"

  // Per-field editing state
  let editingField: string | null = null
  let editValue = ""
  let savingField: string | null = null

  function startEditField(field: string, currentValue: string) {
    editingField = field
    editValue = currentValue
    setTimeout(() => {
      const el = document.getElementById(`profile-edit-${field}`) as HTMLInputElement | null
      el?.focus()
      el?.select()
    })
  }

  function cancelEdit() {
    editingField = null
    editValue = ""
  }

  async function saveField(field: string) {
    if (savingField) return
    if (!editValue.trim()) { cancelEdit(); return }
    savingField = field

    const fullName = field === "fullName" ? editValue : ($profileStore?.full_name || "")
    const companyName = field === "companyName" ? editValue : ($profileStore?.company_name || "")

    try {
      const result = await userSettingsApi.updateProfile(fullName, companyName, "")
      if (result.success) {
        if ($profileStore && result.data) {
          profileStore.set({ ...$profileStore, full_name: result.data.full_name || fullName, company_name: result.data.company_name || companyName })
        } else if ($profileStore) {
          profileStore.set({ ...$profileStore, full_name: fullName, company_name: companyName })
        }
        editingField = null
        const label = field === "fullName" ? "Full Name" : "Company Name"
        toast.success(`${label} updated`)
      } else {
        toast.error("Failed to save")
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      toast.error("An error occurred")
    } finally {
      savingField = null
    }
  }

  function handleFieldKeydown(e: KeyboardEvent, field: string) {
    if (e.key === "Enter") saveField(field)
    if (e.key === "Escape") cancelEdit()
  }
</script>

<svelte:head>
  <title>Profile Settings</title>
</svelte:head>

<!-- Header -->
<div class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5">
  <h2 class="flex items-center gap-2 text-xl font-semibold text-contrast-content">
    <div class="rounded-lg bg-base-content/10 p-1.5">
      <Icon icon="solar:user-bold-duotone" width="18" height="18" class="text-base-content" />
    </div>
    Profile
  </h2>
</div>

<!-- Content -->
<div class="p-6">
  <div class="space-y-4">

    <!-- ===== FULL NAME ===== -->
    <button type="button" on:click={() => startEditField("fullName", $profileStore?.full_name || "")}
      class="flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4 transition-colors hover:border-base-content/20">
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon icon="solar:user-bold-duotone" width="18" height="18" class="text-base-content" />
      </div>
      <div class="flex-1 min-w-0">
        <label class="block text-sm text-contrast-content/60">Full Name</label>
        <p class="font-medium text-contrast-content">{$profileStore?.full_name || "Not set"}</p>
      </div>
      <div class="flex-shrink-0 text-contrast-content/40">
        <Icon icon="solar:pen-bold-duotone" width="18" height="18" />
      </div>
    </button>

    <!-- ===== COMPANY NAME ===== -->
    <button type="button" on:click={() => startEditField("companyName", $profileStore?.company_name || "")}
      class="flex w-full items-center gap-3 text-left rounded-lg border border-base-300 bg-base-200/30 p-4 transition-colors hover:border-base-content/20">
      <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
        <Icon icon="solar:buildings-2-bold-duotone" width="18" height="18" class="text-base-content" />
      </div>
      <div class="flex-1 min-w-0">
        <label class="block text-sm text-contrast-content/60">Company Name</label>
        <p class="font-medium text-contrast-content">{$profileStore?.company_name || "Not set"}</p>
      </div>
      <div class="flex-shrink-0 text-contrast-content/40">
        <Icon icon="solar:pen-bold-duotone" width="18" height="18" />
      </div>
    </button>

    <!-- ===== EMAIL (read-only) ===== -->
    <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
      <div class="flex items-center gap-3">
        <div class="rounded-lg bg-base-content/10 p-2 flex-shrink-0">
          <Icon icon="solar:letter-bold-duotone" width="18" height="18" class="text-base-content" />
        </div>
        <div class="min-w-0 flex-1">
          <label class="block text-sm text-contrast-content/60">Email Address</label>
          <p class="truncate font-medium text-contrast-content">{$session?.user?.email || "Not available"}</p>
          <span class="mt-1 inline-flex items-center gap-1 text-xs text-success">
            <Icon icon="solar:check-circle-bold-duotone" width="12" height="12" />
            Verified
          </span>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Edit Modal -->
{#if editingField}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    on:click={cancelEdit}
    on:keydown={(e) => e.key === "Escape" && cancelEdit()}
    role="presentation"
  >
    <div
      class="w-full max-w-sm rounded-2xl bg-base-100 shadow-2xl overflow-hidden"
      on:click|stopPropagation
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-base-300 px-5 py-4">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-base-content/10">
            <Icon icon={editingField === "fullName" ? "solar:user-bold-duotone" : "solar:buildings-2-bold-duotone"} width="18" height="18" class="text-base-content" />
          </div>
          <div>
            <h4 class="text-base font-semibold text-contrast-content">
              Edit {editingField === "fullName" ? "Name" : "Company"}
            </h4>
          </div>
        </div>
        <button
          class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-base-200"
          on:click={cancelEdit} title="Close">
          <X class="h-4 w-4 text-contrast-content/60" />
        </button>
      </div>

      <!-- Body -->
      <div class="border-t border-base-300 px-5 py-4">
        <label for="profile-edit-{editingField}" class="mb-1 block text-sm font-medium text-contrast-content">
          {editingField === "fullName" ? "Full Name" : "Company Name"}
        </label>
        <input
          id="profile-edit-{editingField}"
          type="text" bind:value={editValue}
          on:keydown={(e) => e.key === "Enter" && editingField && saveField(editingField)}
          autofocus
          placeholder={editingField === "fullName" ? "Enter your full name" : "Enter your company name"}
          class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={savingField != null}
        />
      </div>

      <!-- Footer -->
      <div class="flex justify-end px-5 py-3">
        <button on:click={() => editingField && saveField(editingField)} disabled={savingField != null}
          class="rounded-lg bg-base-content px-4 py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:opacity-50">
          {savingField != null ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  </div>
{/if}
