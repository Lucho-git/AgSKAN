<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { browser } from "$app/environment"
  import { Capacitor } from "@capacitor/core"
  import { Browser } from "@capacitor/browser"
  import { DateTime } from "luxon"
  import InviteModal from "./InviteModal.svelte"
  import { toast } from "svelte-sonner"
  import VehicleIcons from "$lib/vehicles/index.js"
  import { page } from "$app/stores"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { session } from "$lib/stores/sessionStore"
  import { goto } from "$app/navigation"
  import Icon from "@iconify/svelte"
  import {
    Users,
    User,
    UserPlus,
    Plus,
    MapPin,
    LogIn,
    UserX,
    MoreVertical,
    ChevronUp,
    Crown,
    Pencil,
    X,
    Info,
    ExternalLink,
    AlertTriangle,
    UserCheck,
  } from "lucide-svelte"
  import { mapApi } from "$lib/api/mapApi"
  import { userSettingsApi } from "$lib/api/userSettingsApi"
  import { mapSettingsApi } from "$lib/api/mapSettingsApi"

  // Support team user IDs with kick permissions
  const SUPPORT_TEAM_IDS = [
    "200da4aa-8075-481b-b749-e5a29a9d4b90",
    "5ddfda41-6c9f-480f-a4e3-406587c1c659",
    "17b52843-6511-4a9c-8be9-2c710a98e91a",
    "006a8ba5-b899-4831-a2a8-7d93f1d09d23",
    "6f1ae4d2-2000-4eeb-ad71-bf43580693a1",
    "7c2447f6-5e02-4236-bb98-bfba5d6bd3b2",
    "09d4f226-5a43-4c79-b344-cc33c32961cc",
    "17b52843-6511-4a9c-8be9-2c710a98e91a",
    "07ec397d-26ea-4274-bf37-ac6b82ff7184",
    "c767c6b1-6ee0-4125-b964-b854629f1d43",
  ]

  let disconnectingFromMap = false
  let kickingUser = null
  let openMenuId = null
  let cardRefs = {}
  let currentTime = DateTime.utc()
  let timeUpdateInterval
  let forceUpdate = 0

  // Edit name state
  let showEditName = false
  let editNameValue = ""
  let savingName = false

  $: currentUserId = $profileStore.id
  $: is_owner = $connectedMapStore.is_owner
  $: map_owner_id = $connectedMapStore.master_user_id
  $: is_support_team = SUPPORT_TEAM_IDS.includes(currentUserId)
  $: has_kick_permission = is_owner || is_support_team
  $: is_user = (profileId) => profileId === currentUserId
  $: is_map_owner = (profileId) => profileId === map_owner_id

  let enforceLimits = false
  let enforceLimitsLoaded = false

  // Load enforce_limits from DB when map ID is available
  $: if ($connectedMapStore.id && !enforceLimitsLoaded) {
    enforceLimitsLoaded = true
    mapSettingsApi.getEnforceLimits($connectedMapStore.id).then((val) => {
      enforceLimits = val
    })
  }

  $: memberCount = $mapActivityStore.connected_profiles?.length || 0
  $: seatLimit = $connectedMapStore.masterSubscription?.current_seats ?? null
  $: rawOverLimit = seatLimit != null && memberCount > seatLimit
  $: overLimit = enforceLimits && rawOverLimit
  $: ownerName =
    $mapActivityStore.connected_profiles?.find(
      (p: any) => p.id === map_owner_id,
    )?.full_name || "the map owner"

  // Seats info modal
  let showSeatsModal = false
  let seatsDialogEl: HTMLDialogElement

  $: if (showSeatsModal && seatsDialogEl && !seatsDialogEl.open) {
    seatsDialogEl.showModal()
  } else if (!showSeatsModal && seatsDialogEl?.open) {
    seatsDialogEl.close()
  }

  function openBillingPage() {
    showSeatsModal = false
    if (browser && Capacitor.isNativePlatform()) {
      const token = $session?.refresh_token
      const url = `https://skanfarming.com/auth/callback?refresh_token=${encodeURIComponent(token || "")}&next=/account/billing`
      Browser.open({ url })
    } else {
      goto("/account/billing")
    }
  }

  $: sortedProfiles = $mapActivityStore.connected_profiles.sort((a, b) => {
    if (a.id === currentUserId) return -1
    if (b.id === currentUserId) return 1
    const aVehicle = $mapActivityStore.vehicle_states.find(
      (v) => v.vehicle_id === a.id,
    )
    const bVehicle = $mapActivityStore.vehicle_states.find(
      (v) => v.vehicle_id === b.id,
    )
    if (aVehicle && !bVehicle) return -1
    if (!aVehicle && bVehicle) return 1
    if (aVehicle && bVehicle) {
      return (
        new Date(bVehicle.last_update).getTime() -
        new Date(aVehicle.last_update).getTime()
      )
    }
    return 0
  })

  // Reactive status map that updates when currentTime or vehicle_states change
  $: statusMap = (() => {
    // Reference forceUpdate to trigger recalculation
    const _ = forceUpdate

    return $mapActivityStore.vehicle_states.reduce((acc, vehicle) => {
      const updateTime = DateTime.fromISO(vehicle.last_update, { zone: "utc" })
      const diffMinutes = currentTime.diff(updateTime, "minutes").minutes
      const isOnline = diffMinutes <= 10

      acc[vehicle.vehicle_id] = {
        isOnline,
        lastSeenText: updateTime.toRelative({ base: currentTime }),
      }
      return acc
    }, {})
  })()

  onMount(() => {
    // Update current time every 30 seconds to refresh relative times
    timeUpdateInterval = setInterval(() => {
      currentTime = DateTime.utc()
      forceUpdate++
    }, 30000)
  })

  onDestroy(() => {
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval)
    }
  })

  function getVehicleIcon(type: string) {
    return VehicleIcons[type] || VehicleIcons.SimpleTractor
  }

  function updateStores() {
    connectedMapStore.set({
      id: null,
      map_name: null,
      master_user_id: null,
      owner: null,
      is_owner: false,
      masterSubscription: null,
      is_connected: false,
    })
    mapActivityStore.set({
      marker_count: 0,
      trail_count: 0,
      connected_profiles: [],
      vehicle_states: [],
    })
  }

  function removeUserFromStore(id: string) {
    mapActivityStore.update((store) => ({
      ...store,
      connected_profiles: store.connected_profiles.filter(
        (profile) => profile.id !== id,
      ),
      vehicle_states: store.vehicle_states.filter(
        (vehicle) => vehicle.vehicle_id !== id,
      ),
    }))
  }

  async function handleDisconnectFromMap() {
    try {
      disconnectingFromMap = true
      const result = await mapApi.disconnectFromMap()

      if (result.success) {
        updateStores()
        toast.success("Disconnected from map", {
          description: "You have successfully left the map",
        })
        goto("/account")
      } else {
        toast.error("Failed to disconnect", {
          description: result.message || "An error occurred",
        })
      }
    } catch (error) {
      toast.error("Failed to disconnect", {
        description: error.message || "An unexpected error occurred",
      })
    } finally {
      disconnectingFromMap = false
    }
  }

  async function handleKickUser(profile) {
    if (!has_kick_permission) {
      toast.error("Permission denied", {
        description: "You don't have permission to kick users",
      })
      return
    }

    try {
      kickingUser = profile.id
      openMenuId = null
      const result = await mapApi.kickUser(profile.id)

      if (result.success) {
        removeUserFromStore(profile.id)
        toast.success("User kicked", {
          description: `${profile.full_name} has been removed from the map`,
        })
      } else {
        toast.error("Failed to kick user", {
          description: result.message || "An error occurred",
        })
      }
    } catch (error) {
      toast.error("Failed to kick user", {
        description: error.message || "An unexpected error occurred",
      })
    } finally {
      kickingUser = null
    }
  }

  function handleLocate(profile: any, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    toast.info(`Finding ${profile.full_name}`)
    openMenuId = null

    if (profile.id === currentUserId) {
      goto(`/account/mapviewer`)
    } else {
      goto(`/account/mapviewer?vehicle=${profile.id}`)
    }
  }

  function handleConnect(profile: any, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    toast.info(`Connecting as ${profile.full_name}`)
    openMenuId = null

    if (profile.id === currentUserId) {
      goto(`/account/mapviewer`)
    }
  }

  function handleKickUserClick(profile: any, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    handleKickUser(profile)
  }

  function toggleMenu(profileId: string, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    openMenuId = openMenuId === profileId ? null : profileId
  }

  function closeAllMenus() {
    openMenuId = null
  }

  function openEditName() {
    editNameValue = $profileStore?.full_name || ""
    showEditName = true
    openMenuId = null
  }

  function closeEditName() {
    showEditName = false
  }

  async function saveEditName() {
    const newName = editNameValue.trim()
    if (!newName) {
      toast.error("Name is required")
      return
    }

    savingName = true
    try {
      const result = await userSettingsApi.updateProfile(
        newName,
        $profileStore?.company_name || "",
        "",
      )

      if (result.success) {
        showEditName = false
      } else {
        toast.error(result.message || "Could not update name")
      }
    } catch (error) {
      console.error("Error updating name:", error)
      toast.error("Could not update name")
    } finally {
      savingName = false
    }
  }
</script>

<!-- Team Members section -->
<div
  class="mt-4 rounded-lg border border-base-300 bg-base-200 p-4 shadow-md transition-all duration-300 hover:shadow-lg md:mt-6 md:p-6"
>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-6">
    <h2
      class="flex items-center gap-2 text-lg font-bold text-contrast-content md:text-xl"
    >
      <Users size={20} class="text-blue-500" />
      <span>Team Members</span>
    </h2>
    {#if seatLimit != null}
      <div class="flex items-center gap-1.5">
        {#if enforceLimits}
          <button
            type="button"
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white transition-all hover:scale-105 hover:shadow-md active:scale-95 {overLimit
              ? 'bg-red-500 ring-1 ring-red-400/50'
              : 'bg-green-500 ring-1 ring-green-400/50'}"
            on:click={() => (showSeatsModal = true)}
            title="View seat usage details"
          >
            {memberCount}/{seatLimit}
            {#if overLimit}
              <AlertTriangle class="h-3 w-3 opacity-70" />
            {:else}
              <Info class="h-3 w-3 opacity-70" />
            {/if}
          </button>
        {:else}
          <span
            class="inline-flex items-center rounded-full bg-base-300/60 px-2.5 py-1 text-xs font-medium text-contrast-content/60"
          >
            {memberCount}/{seatLimit}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
    {#each sortedProfiles as profile (profile.id)}
      {@const vehicle = $mapActivityStore.vehicle_states.find(
        (v) => v.vehicle_id === profile.id,
      )}
      {@const isCurrentUser = is_user(profile.id)}
      {@const isOwner = is_map_owner(profile.id)}
      {@const status = statusMap[profile.id]}
      {@const online = isCurrentUser || (status?.isOnline ?? false)}
      {@const statusText = isCurrentUser
        ? "Online"
        : !status
          ? "Offline"
          : status.isOnline
            ? "Online"
            : `Last seen ${status.lastSeenText}`}
      {@const statusColor = isCurrentUser
        ? "bg-green-500"
        : !status
          ? "bg-gray-400"
          : status.isOnline
            ? "bg-green-500"
            : "bg-gray-400"}

      <!-- Team member card wrapper -->
      <div class="relative" bind:this={cardRefs[profile.id]}>
        <!-- Clickable card -->
        <div
          role="button"
          tabindex="0"
          class="flex w-full cursor-pointer items-center justify-between rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-all duration-300 hover:border-blue-400 hover:bg-base-100/70 active:scale-[0.99] md:p-4"
          on:click={(e) => toggleMenu(profile.id, e)}
          on:keydown={(e) => e.key === "Enter" && toggleMenu(profile.id, e)}
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="relative flex-shrink-0">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full shadow-sm {isCurrentUser
                  ? 'bg-blue-600'
                  : 'bg-cyan-400'} text-white md:h-11 md:w-11"
              >
                {#if vehicle}
                  <svelte:component
                    this={getVehicleIcon(vehicle.vehicle_marker.type)}
                    bodyColor={vehicle.vehicle_marker.bodyColor}
                    size="75%"
                  />
                {:else}
                  <User size={18} />
                {/if}
              </div>
              <!-- Status indicator -->
              <div
                class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-base-100 {statusColor} {isCurrentUser
                  ? 'animate-pulse'
                  : ''}"
              ></div>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span
                  class="truncate text-sm font-semibold text-contrast-content md:text-base"
                >
                  {profile.full_name}
                </span>
                <div class="flex flex-shrink-0 items-center gap-1">
                  {#if isCurrentUser}
                    <span
                      class="flex h-5 items-center rounded bg-blue-600 px-1.5 text-xs font-medium text-white"
                    >
                      You
                    </span>
                  {/if}
                  {#if isOwner}
                    <span
                      class="flex h-5 items-center justify-center rounded bg-green-600 px-1.5 text-xs font-medium text-white"
                      title="Map Owner"
                    >
                      <Crown size={12} />
                    </span>
                  {/if}
                </div>
              </div>
              <div class="mt-0.5 flex items-center">
                <span
                  class="truncate text-xs font-medium {online
                    ? 'text-green-600'
                    : 'text-gray-400'}"
                >
                  {statusText}
                </span>
              </div>
            </div>
          </div>

          <!-- Menu icon indicator -->
          <div
            class="ml-2 flex-shrink-0 text-base-content/50 transition-all duration-200"
          >
            {#if openMenuId === profile.id}
              <ChevronUp size={18} />
            {:else}
              <MoreVertical size={18} />
            {/if}
          </div>
        </div>

        <!-- Dropdown menu -->
        {#if openMenuId === profile.id}
          <div
            class="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg sm:w-48"
            on:click={(e) => e.stopPropagation()}
          >
            {#if isCurrentUser}
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                on:click={(e) =>
                  vehicle
                    ? handleLocate(profile, e)
                    : handleConnect(profile, e)}
              >
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-green-600/20 sm:h-6 sm:w-6"
                >
                  <LogIn class="h-2.5 w-2.5 text-green-600 sm:h-3 sm:w-3" />
                </div>
                Open Map
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 sm:px-4 sm:text-sm"
                on:click={openEditName}
              >
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-600/20 sm:h-6 sm:w-6"
                >
                  <Pencil class="h-2.5 w-2.5 text-yellow-600 sm:h-3 sm:w-3" />
                </div>
                Edit Name
              </button>
            {:else}
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2 text-xs text-contrast-content transition-colors hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
                on:click={(e) => handleLocate(profile, e)}
                disabled={!vehicle}
              >
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 sm:h-6 sm:w-6"
                >
                  <MapPin class="h-2.5 w-2.5 text-blue-600 sm:h-3 sm:w-3" />
                </div>
                {vehicle ? "Find on Map" : "Offline"}
              </button>

              {#if has_kick_permission && !isOwner}
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
                  on:click={(e) => handleKickUserClick(profile, e)}
                  disabled={kickingUser === profile.id}
                >
                  <div
                    class="flex h-5 w-5 items-center justify-center rounded-full bg-red-600/20 sm:h-6 sm:w-6"
                  >
                    <UserX class="h-2.5 w-2.5 text-red-600 sm:h-3 sm:w-3" />
                  </div>
                  {kickingUser === profile.id ? "Kicking..." : "Kick User"}
                </button>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    <!-- Invite person card -->
    <InviteModal
      {overLimit}
      overLimitCount={memberCount - (seatLimit ?? 0)}
      isOwner={is_owner}
      onBillingClick={openBillingPage}
    >
      <div
        slot="trigger"
        class="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-base-300 bg-base-100/50 p-3 transition-all duration-300 hover:border-yellow-400 hover:bg-base-100 active:scale-[0.99] md:p-4"
      >
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-400/10 text-yellow-600 transition-all duration-300 md:h-11 md:w-11"
          >
            <UserPlus size={18} />
          </div>
          <div class="min-w-0 flex-1">
            <div
              class="truncate text-sm font-semibold text-contrast-content md:text-base"
            >
              Invite Team
            </div>
            <div class="mt-0.5 truncate text-xs text-contrast-content/60">
              Add people to map
            </div>
          </div>
        </div>
        <div
          class="ml-2 flex h-7 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-base-content px-2.5 text-xs font-medium text-base-100 shadow-sm transition-all duration-300 md:h-8"
        >
          <Plus size={14} />
          <span class="hidden sm:inline">Add</span>
        </div>
      </div>
    </InviteModal>
  </div>
</div>

<!-- Edit Name Modal -->
{#if showEditName}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    on:click={closeEditName}
    on:keydown={(e) => e.key === "Escape" && closeEditName()}
    role="presentation"
  >
    <div
      class="w-full max-w-sm rounded-2xl bg-base-100 p-5 shadow-xl sm:p-6"
      on:click|stopPropagation
      role="dialog"
      aria-modal="true"
    >
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-base-content/10 sm:h-10 sm:w-10"
          >
            <Pencil class="h-4 w-4 text-base-content sm:h-5 sm:w-5" />
          </div>
          <div>
            <h4
              class="text-base font-semibold text-contrast-content sm:text-lg"
            >
              Edit Name
            </h4>
            <p class="text-xs text-contrast-content/60 sm:text-sm">
              Update your display name
            </p>
          </div>
        </div>
        <button
          class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-base-200 transition-colors hover:bg-base-300"
          on:click={closeEditName}
          title="Close"
        >
          <X class="h-4 w-4 text-contrast-content/60" />
        </button>
      </div>

      <div class="space-y-2">
        <label
          for="edit-name-input"
          class="block text-sm font-medium text-contrast-content"
        >
          Full Name
        </label>
        <!-- svelte-ignore a11y-autofocus -->
        <input
          id="edit-name-input"
          type="text"
          bind:value={editNameValue}
          on:keydown={(e) => e.key === "Enter" && saveEditName()}
          autofocus
          placeholder="Enter your full name"
          class="w-full rounded-lg border border-base-300 bg-base-100 px-4 py-3 text-contrast-content placeholder-contrast-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div class="mt-5 flex justify-end gap-3">
        <button
          on:click={closeEditName}
          class="rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-contrast-content transition-colors hover:bg-base-200"
        >
          Cancel
        </button>
        <button
          on:click={saveEditName}
          disabled={savingName}
          class="rounded-lg bg-base-content px-4 py-2 text-sm font-medium text-base-100 transition-colors hover:bg-base-content/90 disabled:opacity-50"
        >
          {savingName ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Seats Info Modal -->
<dialog
  bind:this={seatsDialogEl}
  class="modal modal-middle"
  on:close={() => (showSeatsModal = false)}
>
  <div class="modal-box w-full max-w-sm">
    {#if overLimit}
      <!-- ── Over limit ── -->
      <div class="mb-5 flex items-start gap-3">
        <div
          class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20"
        >
          <AlertTriangle class="h-6 w-6 text-red-500" />
        </div>
        <div>
          <h4 class="text-base font-semibold text-contrast-content sm:text-lg">
            Seat Limit Exceeded
          </h4>
          <p class="text-sm text-contrast-content/60">
            {memberCount} members · {seatLimit} seat{seatLimit === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <!-- Seat visual: filled seats overflowing -->
      <div class="mb-4 flex flex-wrap gap-1.5">
        {#each Array(seatLimit) as _, i}
          <div class="h-3 w-3 rounded-sm bg-base-content/40"></div>
        {/each}
        {#each Array(memberCount - seatLimit) as _, i}
          <div class="h-3 w-3 rounded-sm bg-red-500"></div>
        {/each}
      </div>

      <div class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <div class="flex items-center gap-2.5">
          <Users class="h-5 w-5 text-red-500" />
          <p class="text-sm font-medium text-contrast-content">
            {memberCount - seatLimit} member{memberCount - seatLimit === 1
              ? ""
              : "s"} over your limit
          </p>
        </div>
        <p class="mt-2 text-xs text-contrast-content/60">
          Add {memberCount - seatLimit} more seat{memberCount - seatLimit === 1
            ? ""
            : "s"} or remove members to get back within your limit.
        </p>
      </div>

      {#if is_owner}
        <!-- Kickable members list -->
        <div
          class="mb-4 max-h-48 overflow-y-auto rounded-lg border border-base-300"
        >
          {#each sortedProfiles as profile}
            {@const isCurUser = profile.id === currentUserId}
            {@const isOwnerProfile = is_map_owner(profile.id)}
            {#if !isCurUser && !isOwnerProfile}
              <div
                class="flex items-center justify-between border-b border-base-200 px-3 py-2.5 last:border-b-0"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2.5">
                  {#if profile.vehicle}
                    <div
                      class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-cyan-400 text-white"
                    >
                      <svelte:component
                        this={getVehicleIcon(
                          profile.vehicle.vehicle_marker.type,
                        )}
                        bodyColor={profile.vehicle.vehicle_marker.bodyColor}
                        size="70%"
                      />
                    </div>
                  {:else}
                    <div
                      class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cyan-400 text-xs font-medium text-white"
                    >
                      <User size={14} />
                    </div>
                  {/if}
                  <span class="truncate text-sm text-contrast-content">
                    {profile.full_name}
                  </span>
                </div>
                <button
                  on:click={() => handleKickUser(profile)}
                  disabled={kickingUser === profile.id}
                  class="flex-shrink-0 cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {kickingUser === profile.id ? "Kicking..." : "Kick"}
                </button>
              </div>
            {/if}
          {/each}
        </div>
      {/if}

      {#if !is_owner}
        <p class="mb-1 text-xs text-contrast-content/50">
          Owned by <span class="font-medium text-contrast-content/70"
            >{ownerName}</span
          >
        </p>
      {/if}

      <div class="modal-action mt-2">
        <button
          on:click={() => (showSeatsModal = false)}
          class="cursor-pointer rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-200 sm:text-sm"
        >
          Close
        </button>
        {#if is_owner}
          <button
            on:click={openBillingPage}
            class="flex cursor-pointer items-center gap-2 rounded-lg bg-base-content px-4 py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 sm:text-sm"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            Manage Billing
          </button>
        {/if}
      </div>
    {:else if seatLimit != null && memberCount >= seatLimit}
      <!-- ── At limit ── -->
      <div class="mb-5 flex items-start gap-3">
        <div
          class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20"
        >
          <UserCheck class="h-6 w-6 text-green-500" />
        </div>
        <div>
          <h4 class="text-base font-semibold text-contrast-content sm:text-lg">
            All Seats Filled
          </h4>
          <p class="text-sm text-contrast-content/60">
            {memberCount} of {seatLimit} seats used
          </p>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap gap-1.5">
        {#each Array(memberCount) as _, i}
          <div class="h-3 w-3 rounded-sm bg-base-content"></div>
        {/each}
      </div>

      <div
        class="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-4"
      >
        <div class="flex items-center gap-2.5">
          <UserPlus class="h-5 w-5 text-green-500" />
          <p class="text-sm font-medium text-contrast-content">
            Upgrade to invite more members
          </p>
        </div>
        <p class="mt-2 text-xs text-contrast-content/60">
          Purchase additional seats from the billing page to grow your team.
        </p>
      </div>

      <div class="modal-action mt-2">
        <button
          on:click={() => (showSeatsModal = false)}
          class="cursor-pointer rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-200 sm:text-sm"
        >
          Close
        </button>
        {#if is_owner}
          <button
            on:click={openBillingPage}
            class="flex cursor-pointer items-center gap-2 rounded-lg bg-base-content px-4 py-2 text-xs font-medium text-base-100 transition-colors hover:bg-base-content/90 sm:text-sm"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            Manage Billing
          </button>
        {:else}
          <p class="text-xs text-contrast-content/50">
            Owned by <span class="font-medium text-contrast-content/70"
              >{ownerName}</span
            >
          </p>
        {/if}
      </div>
    {:else if seatLimit == null}
      <!-- ── Unlimited ── -->
      <div class="mb-5 flex items-start gap-3">
        <div
          class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20"
        >
          <Users class="h-6 w-6 text-green-500" />
        </div>
        <div>
          <h4 class="text-base font-semibold text-contrast-content sm:text-lg">
            Unlimited Seats
          </h4>
          <p class="text-sm text-contrast-content/60">
            {memberCount} member{memberCount === 1 ? "" : "s"} on your team
          </p>
        </div>
      </div>

      <div class="mb-4 flex items-center gap-3 rounded-lg bg-green-500/10 p-4">
        <UserPlus class="h-5 w-5 flex-shrink-0 text-green-500" />
        <p class="text-sm text-contrast-content">
          Invite as many team members as you need — no seat limits.
        </p>
      </div>

      <div class="modal-action mt-2">
        <button
          on:click={() => (showSeatsModal = false)}
          class="cursor-pointer rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-200 sm:text-sm"
        >
          Close
        </button>
        {#if !is_owner}
          <p class="text-xs text-contrast-content/50">
            Owned by <span class="font-medium text-contrast-content/70"
              >{ownerName}</span
            >
          </p>
        {/if}
      </div>
    {:else}
      <!-- ── Under limit (seats available) ── -->
      <div class="mb-5 flex items-start gap-3">
        <div
          class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20"
        >
          <Users class="h-6 w-6 text-green-500" />
        </div>
        <div>
          <h4 class="text-base font-semibold text-contrast-content sm:text-lg">
            Seat Usage
          </h4>
          <p class="text-sm text-contrast-content/60">
            {memberCount} of {seatLimit} seats used
          </p>
        </div>
      </div>

      <!-- Seat visual: filled + empty slots -->
      {@const remaining = seatLimit - memberCount}
      <div class="mb-4 flex flex-wrap gap-1.5">
        {#each Array(memberCount) as _, i}
          <div class="h-3 w-3 rounded-sm bg-base-content"></div>
        {/each}
        {#each Array(remaining) as _, i}
          <div
            class="h-3 w-3 rounded-sm border border-dashed border-base-content/30"
          ></div>
        {/each}
      </div>

      <div class="mb-4 flex items-center gap-3 rounded-lg bg-green-500/10 p-4">
        <UserPlus class="h-5 w-5 flex-shrink-0 text-green-500" />
        <p class="text-sm text-contrast-content">
          You can invite <strong
            >{remaining} more member{remaining === 1 ? "" : "s"}</strong
          > to your team.
        </p>
      </div>

      <div class="modal-action mt-2">
        <button
          on:click={() => (showSeatsModal = false)}
          class="cursor-pointer rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-xs font-medium text-contrast-content transition-colors hover:bg-base-200 sm:text-sm"
        >
          Close
        </button>
        {#if !is_owner}
          <p class="text-xs text-contrast-content/50">
            Owned by <span class="font-medium text-contrast-content/70"
              >{ownerName}</span
            >
          </p>
        {/if}
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<svelte:window on:click={closeAllMenus} />
