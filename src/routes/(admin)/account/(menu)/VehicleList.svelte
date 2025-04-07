<script lang="ts">
  import { onMount } from "svelte"
  import { DateTime } from "luxon"
  import InviteModal from "./InviteModal.svelte"
  import * as Avatar from "$lib/components/ui/avatar"
  import { Skeleton } from "$lib/components/ui/skeleton"
  import { toast } from "svelte-sonner"
  import VehicleIcons from "$lib/vehicles/index.js"
  import * as Tabs from "$lib/components/ui/tabs"
  import { page } from "$app/stores"
  import { enhance, applyAction } from "$app/forms"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapActivityStore } from "$lib/stores/mapActivityStore"
  import { goto } from "$app/navigation"
  import Icon from "@iconify/svelte"
  // Import the mapApi for direct client-side calls
  import { mapApi } from "$lib/api/mapApi"

  let loading = true
  let activeTab = "navigate"
  let disconnectingFromMap = false
  let kickingUser = null

  $: currentUserId = $profileStore.id
  $: is_owner = $connectedMapStore.is_owner
  $: is_user = (profileId) => profileId === currentUserId

  $: buttonClass = activeTab === "manage" ? "btn-error" : "btn-primary"
  $: buttonText = activeTab === "manage" ? "Kick" : "Locate"

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

    // Use the toRelative method to get human-readable duration
    const timeDifference = updateTime.toRelative({ base: now })
    return timeDifference
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
    // Also clear the mapActivityStore to a default state
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
</script>

<div class="mt-0 rounded-lg bg-base-200 p-4 shadow-lg" style="z-index: 0;">
  <div class="mb-4 flex items-center justify-between">
    <h3 class="text-2xl font-bold">People</h3>
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => (activeTab = value)}
      class="w-[200px]"
    >
      <Tabs.List class="grid h-full grid-cols-2 rounded-lg bg-base-300 p-1">
        <Tabs.Trigger
          value="navigate"
          class="rounded-lg px-4 py-2 text-base-content transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-content"
        >
          Navigate
        </Tabs.Trigger>
        <Tabs.Trigger
          value="manage"
          class="rounded-lg px-4 py-2 text-base-content transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-content"
        >
          Manage
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
    {#each sortedProfiles as profile}
      {@const vehicle = $mapActivityStore.vehicle_states.find(
        (v) => v.vehicle_id === profile.id,
      )}
      <div
        class="flex items-center rounded-lg bg-base-100 p-4 shadow-md {is_user(
          profile.id,
        )
          ? 'border-2 border-primary'
          : ''}"
      >
        <div
          class="mr-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted"
        >
          {#if vehicle}
            <svelte:component
              this={getVehicleIcon(vehicle.vehicle_marker.type)}
              bodyColor={vehicle.vehicle_marker.bodyColor}
              size="80%"
            />
          {:else}
            <Icon
              icon="solar:chair-bold"
              width="40"
              height="40"
              class="text-base-content"
            />
          {/if}
        </div>
        <div class="flex-grow">
          <h4 class="font-bold">{profile.full_name}</h4>
          {#if vehicle}
            <p class="text-sm opacity-70">
              Last update: {getTimeSinceLastUpdate(vehicle.last_update)}
            </p>
          {:else}
            <p class="text-sm opacity-70">Hasn't selected vehicle</p>
          {/if}
        </div>
        {#if activeTab === "manage"}
          {#if is_user(profile.id)}
            <button
              class="btn btn-warning btn-sm m-auto"
              on:click={handleDisconnectFromMap}
              disabled={disconnectingFromMap}
            >
              {#if disconnectingFromMap}
                <span class="loading loading-spinner loading-xs"></span>
              {/if}
              Leave
            </button>
          {:else}
            <button
              class="btn {buttonClass} btn-sm m-auto"
              on:click={() => handleKickUser(profile)}
              disabled={!is_owner || kickingUser === profile.id}
            >
              {#if kickingUser === profile.id}
                <span class="loading loading-spinner loading-xs"></span>
              {/if}
              {buttonText}
            </button>
          {/if}
        {:else}
          <button
            class="btn btn-outline btn-sm m-auto"
            class:btn-outline-info={!vehicle}
            on:click={() =>
              vehicle ? handleLocate(profile) : handleConnect(profile)}
            disabled={!vehicle && !is_user(profile.id)}
          >
            {vehicle ? "Locate" : "Connect"}
          </button>
        {/if}
      </div>
    {/each}
    <!-- New invite box -->
    <div class="flex items-center rounded-lg p-4 shadow-md">
      <div
        class="mr-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted"
      >
        <Icon
          icon="solar:user-plus-rounded-bold"
          width="40"
          height="40"
          class="text-base-content"
        />
      </div>
      <div class="flex-grow">
        <h4 class="font-bold">Invite Person</h4>
      </div>
      <InviteModal />
    </div>
  </div>
</div>
