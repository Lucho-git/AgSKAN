<script lang="ts">
  import { onMount } from "svelte"
  import { DateTime } from "luxon"
  import InviteModal from "./InviteModal.svelte"
  import { toast } from "svelte-sonner"
  import VehicleIcons from "$lib/vehicles/index.js"
  import { page } from "$app/stores"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
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
  } from "lucide-svelte"
  import { mapApi } from "$lib/api/mapApi"

  // Support team user IDs with kick permissions
  const SUPPORT_TEAM_IDS = [
    "200da4aa-8075-481b-b749-e5a29a9d4b90",
    "5ddfda41-6c9f-480f-a4e3-406587c1c659",
    "17b52843-6511-4a9c-8be9-2c710a98e91a",
    "006a8ba5-b899-4831-a2a8-7d93f1d09d23",
    "6f1ae4d2-2000-4eeb-ad71-bf43580693a1",
  ]

  let loading = true
  let disconnectingFromMap = false
  let kickingUser = null
  let openMenuId = null
  let cardRefs = {}

  $: currentUserId = $profileStore.id
  $: is_owner = $connectedMapStore.is_owner
  $: is_support_team = SUPPORT_TEAM_IDS.includes(currentUserId)
  $: has_kick_permission = is_owner || is_support_team
  $: is_user = (profileId) => profileId === currentUserId

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

  onMount(() => {
    loading = false
  })

  function getTimeSinceLastUpdate(lastUpdate) {
    const updateTime = DateTime.fromISO(lastUpdate, { zone: "utc" })
    const now = DateTime.utc()
    const timeDifference = updateTime.toRelative({ base: now })
    return timeDifference
  }

  function isOnline(lastUpdate) {
    if (!lastUpdate) return false
    const updateTime = DateTime.fromISO(lastUpdate, { zone: "utc" })
    const now = DateTime.utc()
    const diffMinutes = now.diff(updateTime, "minutes").minutes
    return diffMinutes <= 10
  }

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

  function getStatusColor(profile, vehicle) {
    if (!vehicle) return "bg-gray-400"
    return isOnline(vehicle.last_update) ? "bg-green-500" : "bg-gray-400"
  }

  function getStatusText(profile, vehicle) {
    if (!vehicle) return "Offline"

    if (isOnline(vehicle.last_update)) {
      return "Online"
    } else {
      return `Last seen ${getTimeSinceLastUpdate(vehicle.last_update)}`
    }
  }
</script>

<!-- Team Members section -->
<div
  class="mt-4 rounded-lg border border-base-300 bg-base-100 p-4 shadow-md transition-all duration-300 hover:shadow-lg md:mt-6 md:p-6"
>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-6">
    <h2
      class="flex items-center gap-2 text-lg font-bold text-contrast-content md:text-xl"
    >
      <Users size={20} class="text-blue-500" />
      <span>Team Members</span>
    </h2>
  </div>

  <div class="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
    {#each sortedProfiles as profile}
      {@const vehicle = $mapActivityStore.vehicle_states.find(
        (v) => v.vehicle_id === profile.id,
      )}
      {@const isCurrentUser = is_user(profile.id)}
      {@const online = vehicle ? isOnline(vehicle.last_update) : false}

      <!-- Team member card wrapper -->
      <div class="relative" bind:this={cardRefs[profile.id]}>
        <!-- Clickable card -->
        <div
          role="button"
          tabindex="0"
          class="flex w-full cursor-pointer items-center justify-between rounded-lg border border-base-300 bg-base-200 p-3 text-left transition-all duration-300 hover:border-blue-400 hover:bg-base-300/50 active:scale-[0.99] md:p-4"
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
                class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-base-100 {getStatusColor(
                  profile,
                  vehicle,
                )} {online && isCurrentUser ? 'animate-pulse' : ''}"
              ></div>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span
                  class="truncate text-sm font-semibold text-contrast-content md:text-base"
                >
                  {profile.full_name}
                </span>
                {#if isCurrentUser}
                  <span
                    class="flex-shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white"
                  >
                    You
                  </span>
                {/if}
              </div>
              <div class="mt-0.5 flex items-center gap-1.5">
                <span
                  class="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full {getStatusColor(
                    profile,
                    vehicle,
                  )} {online && isCurrentUser ? 'animate-pulse' : ''}"
                ></span>
                <span
                  class="truncate text-xs font-medium {online
                    ? 'text-green-600'
                    : 'text-gray-400'}"
                >
                  {getStatusText(profile, vehicle)}
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
            class="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-base-300 bg-base-100 shadow-lg"
            on:click={(e) => e.stopPropagation()}
          >
            {#if isCurrentUser}
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-left text-sm font-medium text-base-content transition-colors hover:bg-base-200"
                on:click={(e) =>
                  vehicle
                    ? handleLocate(profile, e)
                    : handleConnect(profile, e)}
              >
                <LogIn size={16} />
                <span>Connect</span>
              </button>
            {:else}
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-t-lg px-4 py-2.5 text-left text-sm font-medium text-base-content transition-colors hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-50"
                on:click={(e) => handleLocate(profile, e)}
                disabled={!vehicle}
              >
                <MapPin size={16} />
                <span>{vehicle ? "Find on Map" : "Offline"}</span>
              </button>

              {#if has_kick_permission}
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-b-lg border-t border-base-300 px-4 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  on:click={(e) => handleKickUserClick(profile, e)}
                  disabled={kickingUser === profile.id}
                >
                  <UserX size={16} />
                  <span
                    >{kickingUser === profile.id
                      ? "Kicking..."
                      : "Kick User"}</span
                  >
                </button>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    <!-- Invite person card -->
    <div
      class="flex items-center justify-between rounded-lg border border-dashed border-base-300 bg-base-200/50 p-3 transition-all duration-300 hover:border-yellow-400 md:p-4"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div
          class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-400/10 text-yellow-600 transition-all duration-300 md:h-11 md:w-11"
        >
          <UserPlus size={18} />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-contrast-content md:text-base">
            Invite Team
          </div>
          <div class="mt-0.5 text-xs text-contrast-content/60">
            Add people to map
          </div>
        </div>
      </div>
      <InviteModal>
        <button
          slot="trigger"
          class="ml-2 flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-yellow-400 px-4 text-sm font-medium text-black shadow-sm transition-all duration-300 hover:bg-yellow-300 hover:shadow active:scale-95"
        >
          <Plus size={16} />
          <span class="hidden sm:inline">Invite</span>
        </button>
      </InviteModal>
    </div>
  </div>
</div>

<svelte:window on:click={closeAllMenus} />
