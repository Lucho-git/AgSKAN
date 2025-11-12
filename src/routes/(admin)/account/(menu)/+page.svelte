<!-- src\routes\(admin)\account\(menu)\+page.svelte -->

<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import MapStats from "../(menu)/MapStats.svelte"
  import VehicleList from "./VehicleList.svelte"
  import { page } from "$app/stores"
  import { profileStore } from "$lib/stores/profileStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import MasterMapManager from "./MasterMapManager.svelte"
  import DashboardMenu from "./DashboardMenu.svelte"

  export let data
  $: ({ subscription, vehicles, isOwner } = data)

  console.log("Load Data", data)

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("home")

  onMount(async () => {
    // The profile data should already be loaded in the profileStore
    // No need to fetch it again if it's already there
    if ($page.data.session && (!$profileStore || !$profileStore.id)) {
      console.log("Profile not found in store, loading from session")
      await profileStore.loadProfile($page.data.session.user.id)
    } else {
      console.log("Profile already loaded in store:", $profileStore?.email)
    }
  })
</script>

<svelte:head>
  <title>Account</title>
</svelte:head>
<!-- <AlertBanner
    title="Limited Time Offer: Launch Week Sale!"
    description="Enjoy special pricing for the next 7 days during our launch week. This is the best price we will ever offer, don't miss out! Deal Ends Tuesday."
    link="/account/billing"
  /> -->
<div class="mx-auto w-full">
  <div>
    <!-- <h2 class="mt-2 text-2xl font-bold">Map Manager</h2> -->

    <DashboardMenu />
    <div class="flex items-center space-x-4">
      <div class="space-y-2"></div>
    </div>
    {#if $connectedMapStore.is_connected}
      <MapStats />
      <VehicleList />
    {/if}
  </div>
</div>
