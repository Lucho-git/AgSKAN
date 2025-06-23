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
  import { Users, User, UserPlus, Plus } from "lucide-svelte"
  // Import the mapApi for direct client-side calls
  import { mapApi } from "$lib/api/mapApi"

  let loading = true
  let disconnectingFromMap = false
  let kickingUser = null

  $: currentUserId = $profileStore.id
  $: is_owner = $connectedMapStore.is_owner
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
    console.log("mapActivityStore", $mapActivityStore)
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
    if (!is_owner) {
      toast.error("Permission denied", {
        description: "Only the map owner can kick users",
      })
      return
    }

    try {
      kickingUser = profile.id
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

  function handleLocate(profile: any) {
    toast.info(`Finding ${profile.full_name}`)

    if (profile.id === currentUserId) {
      goto(`/account/mapviewer`)
    } else {
      goto(`/account/mapviewer?vehicle=${profile.id}`)
    }
  }

  function handleConnect(profile: any) {
    toast.info(`Connecting as ${profile.full_name}`)

    if (profile.id === currentUserId) {
      goto(`/account/mapviewer`)
    }
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
  class="mt-6 rounded-lg border border-base-300 bg-base-100 p-6 shadow-md transition-all duration-300 hover:shadow-lg"
>
  <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
    <h2 class="flex items-center gap-2 text-xl font-bold text-contrast-content">
      <Users size={20} class="text-blue-500" /> Team Members
    </h2>
  </div>

  <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
    {#each sortedProfiles as profile}
      {@const vehicle = $mapActivityStore.vehicle_states.find(
        (v) => v.vehicle_id === profile.id,
      )}
      {@const isCurrentUser = is_user(profile.id)}
      {@const online = vehicle ? isOnline(vehicle.last_update) : false}

      <!-- Team member card -->
      <div
        class="flex items-center justify-between rounded-xl border border-base-300 bg-base-200 p-5 transition-all duration-300 hover:border-blue-400"
      >
        <div class="flex items-center gap-4">
          <div class="relative">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-full shadow-sm {isCurrentUser
                ? 'bg-blue-600'
                : 'bg-cyan-400'} text-white"
            >
              {#if vehicle}
                <svelte:component
                  this={getVehicleIcon(vehicle.vehicle_marker.type)}
                  bodyColor={vehicle.vehicle_marker.bodyColor}
                  size="80%"
                />
              {:else}
                <User size={20} />
              {/if}
            </div>
            <!-- Status indicator -->
            <div
              class="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-base-100 {getStatusColor(
                profile,
                vehicle,
              )} {online && isCurrentUser ? 'animate-pulse' : ''}"
            ></div>
          </div>
          <div>
            <div class="text-base font-medium text-contrast-content">
              {profile.full_name}
            </div>
            <div class="mt-1 flex items-center gap-1.5">
              <span
                class="inline-block h-2 w-2 rounded-full {getStatusColor(
                  profile,
                  vehicle,
                )} {online && isCurrentUser ? 'animate-pulse' : ''}"
              ></span>
              <span
                class="text-xs font-medium {online
                  ? 'text-green-600'
                  : 'text-gray-400'}"
              >
                {getStatusText(profile, vehicle)}
              </span>
            </div>
          </div>
        </div>

        {#if isCurrentUser}
          <button
            class="rounded-lg border-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 transition-all duration-300 hover:bg-blue-600 hover:text-white"
            on:click={() =>
              vehicle ? handleLocate(profile) : handleConnect(profile)}
          >
            Connect
          </button>
        {:else}
          <button
            class="rounded-lg border-2 border-base-content px-4 py-2 text-sm font-medium text-base-content transition-all duration-300 hover:bg-base-content hover:text-base-100"
            on:click={() => (vehicle ? handleLocate(profile) : null)}
            disabled={!vehicle}
            class:opacity-50={!vehicle}
            class:cursor-not-allowed={!vehicle}
          >
            {vehicle ? "Find" : "Offline"}
          </button>
        {/if}
      </div>
    {/each}

    <!-- Invite person card -->
    <div
      class="flex items-center justify-between rounded-xl border border-dashed border-base-300 bg-base-200/50 p-5 transition-all duration-300 hover:border-yellow-400"
    >
      <div class="flex items-center gap-4">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400/10 text-yellow-600 transition-all duration-300"
        >
          <UserPlus size={20} />
        </div>
        <div>
          <div class="text-base font-medium text-contrast-content">
            Invite New Team Member
          </div>
          <div class="mt-1 text-sm text-contrast-content/60">
            Add operators or managers to your farm
          </div>
        </div>
      </div>
      <InviteModal>
        <button
          slot="trigger"
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-400 text-black shadow-sm transition-all duration-300 hover:bg-yellow-300 hover:shadow"
        >
          <Plus size={18} />
        </button>
      </InviteModal>
    </div>
  </div>
</div>
