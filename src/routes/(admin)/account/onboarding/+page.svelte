<!-- src/routes/(admin)/account/onboarding/+page.svelte -->
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
      mobileDescription: "Oversee operations and manage teams",
      accentColor: "#17a34a", // Green (emerald-500)
      hoverColor: "rgb(16 185 129)", // emerald-500
      gradientBg: "bg-gradient-to-br from-base-200 to-base-300/50",
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
      mobileDescription: "Execute operations and track progress",
      accentColor: "#3B82F6", // Blue (blue-500)
      hoverColor: "rgb(59 130 246)", // blue-500
      gradientBg: "bg-gradient-to-br to-base-100 from-base-300/50",
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
      const { error } = await supabase
        .from("profiles")
        .update({ role: selectedRole })
        .eq("id", $profileStore.id)

      if (error) throw error

      profileStore.update((profile) => ({
        ...profile,
        user_type: selectedRole,
      }))

      if (selectedRole === "operator") {
        goto("/account/onboarding/operator/profile")
      } else if (selectedRole === "manager") {
        goto("/account/onboarding/manager/profile")
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
  <meta name="description" content="Select your role to begin" />
</svelte:head>

<div
  class="relative min-h-screen overflow-hidden bg-gradient-to-b from-base-100 to-base-200"
>
  <!-- Decorative Elements - hidden on mobile for cleaner look -->
  <div
    class="pointer-events-none absolute -right-20 top-20 hidden h-64 w-64 rounded-full bg-base-content/5 blur-3xl md:block"
  ></div>
  <div
    class="pointer-events-none absolute -left-20 bottom-20 hidden h-80 w-80 rounded-full bg-base-content/5 blur-3xl md:block"
  ></div>

  <!-- Main content -->
  <main
    class="container relative z-10 mx-auto flex flex-col items-center px-4 py-8 md:px-6 md:py-16"
  >
    <div class="mb-6 w-full max-w-4xl md:mb-12">
      <!-- Compact header for mobile -->
      <div class="mb-6 text-center md:mb-14">
        <h2
          class="relative mb-2 inline-block text-2xl font-bold text-contrast-content md:mb-4 md:text-4xl lg:text-5xl"
        >
          Welcome to
          <span class="ml-2 text-base-content"> AgSKAN </span>
        </h2>
        <p
          class="mx-auto max-w-2xl text-base text-contrast-content/60 md:text-lg"
        >
          Select your role to begin
        </p>
      </div>

      <!-- Error Alert -->
      {#if formError}
        <div class="alert alert-error mb-4 md:mb-6">
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

      <!-- Role selection cards - more compact on mobile -->
      <div
        class="perspective-[1000px] relative mb-6 grid grid-cols-1 gap-4 md:mb-12 md:grid-cols-2 md:gap-8"
      >
        {#each roles as role}
          <div
            class="role-card group relative cursor-pointer overflow-hidden rounded-xl transition-shadow duration-200
              {role.gradientBg}
              {selectedRole === role.id
              ? 'border-2 shadow-[0_0_15px_rgba(0,0,0,0.15)]'
              : 'border border-base-300 hover:shadow-md'}"
            style="--hover-color: {role.hoverColor}; {selectedRole === role.id
              ? `border-color: ${role.accentColor};`
              : ''}"
            on:click={() => (selectedRole = role.id)}
            on:keydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                selectedRole = role.id
              }
            }}
            role="button"
            tabindex="0"
          >
            <!-- Top border -->
            <div
              class="top-border h-0 w-full
                     {selectedRole === role.id
                ? ''
                : 'border-t border-base-300'}"
              style={selectedRole === null || selectedRole === role.id
                ? `border-top: 4px md:border-top-width-6 solid ${role.accentColor};`
                : ""}
            ></div>

            <div
              class="absolute inset-0 bg-gradient-to-b from-transparent to-base-200/40 opacity-0 transition-opacity group-hover:opacity-100"
            ></div>
            <div class="relative z-10 p-4 md:p-8">
              <div class="mb-4 flex items-start justify-between md:mb-6">
                <!-- Icon container -->
                <div
                  class="rounded-lg p-2 transition-colors duration-200 md:rounded-xl md:p-4"
                  style={selectedRole === role.id
                    ? `background-color: ${role.accentColor}20; color: ${role.accentColor};`
                    : ""}
                  class:bg-base-200={selectedRole !== role.id}
                  class:text-contrast-content={selectedRole !== role.id}
                  class:group-hover:text-emerald-500={selectedRole !==
                    role.id && role.id === "manager"}
                  class:group-hover:text-blue-500={selectedRole !== role.id &&
                    role.id === "operator"}
                >
                  <svelte:component
                    this={role.Icon}
                    size={24}
                    class="transition-transform group-hover:scale-110 md:h-8 md:w-8"
                  />
                </div>

                <!-- Checkmark circle -->
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full md:h-6 md:w-6"
                  style={selectedRole === role.id
                    ? `background-color: ${role.accentColor}; color: #ffffff;`
                    : ""}
                  class:border={selectedRole !== role.id}
                  class:border-base-300={selectedRole !== role.id}
                  class:group-hover:border-emerald-500={selectedRole !==
                    role.id && role.id === "manager"}
                  class:group-hover:border-blue-500={selectedRole !== role.id &&
                    role.id === "operator"}
                >
                  {#if selectedRole === role.id}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      class="md:h-3.5 md:w-3.5"
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

              <!-- Title -->
              <h3
                class="mb-2 text-lg font-bold md:mb-3 md:text-2xl"
                style={selectedRole === role.id
                  ? `color: ${role.accentColor};`
                  : ""}
                class:text-contrast-content={selectedRole !== role.id}
                class:group-hover:text-emerald-500={selectedRole !== role.id &&
                  role.id === "manager"}
                class:group-hover:text-blue-500={selectedRole !== role.id &&
                  role.id === "operator"}
                class:origin-left={selectedRole === role.id}
                class:scale-105={selectedRole === role.id}
                class:transform={selectedRole === role.id}
              >
                {role.title}
              </h3>

              <!-- Description - shorter on mobile -->
              <p
                class="mb-4 text-xs text-contrast-content/60 md:mb-8 md:text-sm"
              >
                <span class="md:hidden">{role.mobileDescription}</span>
                <span class="hidden md:block">{role.description}</span>
              </p>

              <!-- Features - only show on larger screens -->
              <div class="hidden grid-cols-2 gap-4 md:grid">
                {#each role.features as feature}
                  <div class="flex items-center gap-2">
                    <div
                      style={selectedRole === role.id
                        ? `color: ${role.accentColor};`
                        : ""}
                      class:text-contrast-content={selectedRole !== role.id}
                      class:group-hover:text-emerald-500={selectedRole !==
                        role.id && role.id === "manager"}
                      class:group-hover:text-blue-500={selectedRole !==
                        role.id && role.id === "operator"}
                    >
                      <svelte:component this={feature.icon} size={16} />
                    </div>
                    <span
                      class="text-sm
                      {selectedRole === role.id
                        ? 'text-contrast-content'
                        : 'text-contrast-content/80'}"
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

      <!-- Continue Button - more compact on mobile -->
      <div class="flex flex-col items-center">
        <button
          class="group flex w-full max-w-xs items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200 md:w-auto md:max-w-none md:px-8 md:py-4 md:text-base
            {selectedRole
            ? 'transform bg-base-content text-base-100 shadow-lg shadow-base-content/20 hover:scale-105 hover:bg-base-content/90 hover:shadow-xl hover:shadow-base-content/30'
            : 'cursor-not-allowed bg-base-300 text-contrast-content/40'}"
          disabled={!selectedRole || loading}
          on:click={handleSubmit}
        >
          {#if loading}
            <span class="loading loading-spinner loading-sm md:loading-md"
            ></span>
          {:else}
            <span
              >Continue as {selectedRole === "manager"
                ? "Manager"
                : selectedRole === "operator"
                  ? "Operator"
                  : "..."}</span
            >
            <ArrowRight
              size={16}
              class="md:w-4.5 md:h-4.5 transition-transform duration-200 {selectedRole
                ? 'group-hover:translate-x-1'
                : ''}"
            />
          {/if}
        </button>

        <p
          class="mt-2 px-4 text-center text-xs text-contrast-content/40 md:mt-4"
        >
          You can change your role later in settings
        </p>
      </div>
    </div>
  </main>
</div>

<style>
  .role-card:not(.border-2):hover {
    border-color: var(--hover-color);
  }

  .role-card:not(.border-2):hover .top-border {
    border-top-color: var(--hover-color);
  }
</style>
