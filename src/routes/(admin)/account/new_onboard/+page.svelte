<!-- src/routes/(admin)/account/select_role/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    Tractor,
    Users,
    MapPin,
    ClipboardList,
    UserRound,
    Send,
    ArrowRight,
  } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"

  let selectedRole: "manager" | "operator" | null = null
  let formError: string | null = null
  let loading = false

  const roles = [
    {
      id: "manager",
      title: "Farm Manager",
      Icon: Users,
      description:
        "Create and oversee farm operations, manage team members, and analyze performance metrics",
      features: [
        { text: "Manage Maps", icon: MapPin },
        { text: "Team Control", icon: UserRound },
      ],
    },
    {
      id: "operator",
      title: "Field Operator",
      Icon: Tractor,
      description:
        "Execute field operations, track progress, and submit reports from the field",
      features: [
        { text: "View Tasks", icon: ClipboardList },
        { text: "Track Progress", icon: Send },
      ],
    },
  ]

  async function handleSubmit() {
    if (!selectedRole) {
      formError = "Please select a role"
      return
    }

    loading = true
    formError = null

    try {
      // Update the role field in profiles table
      const { error } = await supabase
        .from("profiles")
        .update({ role: selectedRole })
        .eq("id", $profileStore.id)

      if (error) throw error

      // Update local profile store
      profileStore.update((profile) => ({
        ...profile,
        user_type: selectedRole,
      }))

      // Navigate to next page based on role
      if (selectedRole === "operator") {
        goto("/account/join_map")
      } else if (selectedRole === "manager") {
        goto("/account/onboard_manager")
      }
    } catch (error) {
      console.error("Error:", error)
      formError = "Failed to update role"
      toast.error(formError)
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>Choose Your Role - AgSKAN</title>
  <meta
    name="description"
    content="Select your role to begin your agricultural management experience"
  />
</svelte:head>

<div
  class="relative min-h-screen overflow-hidden bg-gradient-to-b from-base-100 to-base-200"
>
  <!-- Decorative Elements -->
  <div
    class="pointer-events-none absolute -right-20 top-20 h-64 w-64 rounded-full bg-warning/5 blur-3xl"
  ></div>
  <div
    class="pointer-events-none absolute -left-20 bottom-20 h-80 w-80 rounded-full bg-warning/5 blur-3xl"
  ></div>

  <!-- Main content -->
  <main
    class="container relative z-10 mx-auto flex flex-col items-center px-6 py-16"
  >
    <div class="mb-12 w-full max-w-4xl">
      <div class="mb-14 text-center">
        <h2
          class="relative mb-4 inline-block text-4xl font-bold text-contrast-content md:text-5xl"
        >
          Welcome to
          <span class="ml-2 text-base-content"> AGSKAN </span>
        </h2>
        <p class="mx-auto max-w-2xl text-lg text-contrast-content/60">
          Select your role to begin your agricultural management experience
        </p>
      </div>

      <!-- Error Alert -->
      {#if formError}
        <div class="alert alert-error mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{formError}</span>
        </div>
      {/if}

      <!-- Role selection cards -->
      <div
        class="perspective-[1000px] relative mb-12 grid grid-cols-1 gap-8 md:grid-cols-2"
      >
        {#each roles as role}
          <div
            class="group relative transform cursor-pointer overflow-hidden rounded-xl transition-all duration-300 hover:scale-[1.02]
              {selectedRole === role.id
              ? 'border-2 border-warning bg-base-100 shadow-[0_0_15px_rgba(254,221,100,0.3)]'
              : 'border border-base-300 bg-base-100 hover:border-warning/40 hover:shadow-md'}"
            on:click={() => (selectedRole = role.id)}
            on:keydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                selectedRole = role.id
              }
            }}
            role="button"
            tabindex="0"
          >
            <div
              class="absolute inset-0 bg-gradient-to-b from-transparent to-base-200/40 opacity-0 transition-opacity group-hover:opacity-100"
            ></div>
            <div class="p-8">
              <div class="mb-6 flex items-start justify-between">
                <div
                  class="rounded-xl p-4 transition-all duration-300
                  {selectedRole === role.id
                    ? 'bg-warning/20 text-warning'
                    : 'bg-base-200 text-contrast-content group-hover:bg-warning/10 group-hover:text-warning'}"
                >
                  <svelte:component
                    this={role.Icon}
                    size={32}
                    class="transition-transform group-hover:scale-110"
                  />
                </div>
                <div
                  class="flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300
                  {selectedRole === role.id
                    ? 'bg-warning text-warning-content'
                    : 'border border-base-300 group-hover:border-warning/40'}"
                >
                  {#if selectedRole === role.id}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  {/if}
                </div>
              </div>

              <h3
                class="mb-3 text-2xl font-bold transition-all duration-300
                {selectedRole === role.id
                  ? 'origin-left scale-105 transform text-warning'
                  : 'text-contrast-content group-hover:text-warning'}"
              >
                {role.title}
              </h3>
              <p class="mb-8 text-sm text-contrast-content/60">
                {role.description}
              </p>

              <div class="grid grid-cols-2 gap-4">
                {#each role.features as feature}
                  <div class="flex items-center gap-2">
                    <svelte:component
                      this={feature.icon}
                      size={16}
                      class="{selectedRole === role.id
                        ? 'text-warning'
                        : 'text-contrast-content/60 group-hover:text-warning'} transition-all"
                    />
                    <span
                      class="text-sm {selectedRole === role.id
                        ? 'text-contrast-content'
                        : 'text-contrast-content/80'} transition-colors"
                    >
                      {feature.text}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Continue Button -->
      <div class="flex flex-col items-center">
        <button
          class="group flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-base font-semibold transition-all duration-300
            {selectedRole
            ? 'hover:bg-warning-focus transform bg-warning text-warning-content shadow-lg shadow-warning/20 hover:scale-105 hover:shadow-xl hover:shadow-warning/30'
            : 'cursor-not-allowed bg-base-300 text-contrast-content/40'}"
          disabled={!selectedRole || loading}
          on:click={handleSubmit}
        >
          {#if loading}
            <span class="loading loading-spinner"></span>
          {:else}
            <span
              >Continue as {selectedRole === "manager"
                ? "Farm Manager"
                : selectedRole === "operator"
                  ? "Field Operator"
                  : "..."}</span
            >
            <ArrowRight
              size={18}
              class="transition-transform duration-300 {selectedRole
                ? 'group-hover:translate-x-1'
                : ''}"
            />
          {/if}
        </button>

        <p class="mt-4 text-xs text-contrast-content/40">
          You can change your role later in account settings
        </p>
      </div>
    </div>
  </main>
</div>

<style>
  .perspective-1000 {
    perspective: 1000px;
  }
</style>
