<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte"
  import type { Writable } from "svelte/store"
  import { userStore } from "../../../../stores/userStore"
  import { supabase } from "$lib/supabaseClient"
  import MapStats from "../(menu)/MapStats.svelte"
  import VehicleList from "./VehicleList.svelte"
  import { page } from "$app/stores"
  import AlertBanner from "../../../../components/AlertBanner.svelte"
  import { Skeleton } from "$lib/components/ui/skeleton/index.js"
  import { profileStore } from "../../../../stores/profileStore"
  import { connectedMapStore } from "../../../../stores/connectedMapStore"
  import MasterMapManager from "./MasterMapManager.svelte"

  export let data
  $: ({ subscription, vehicles, isOwner } = data)

  console.log("Load Data", data)

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("home")

  onMount(async () => {
    const session = $page.data.session
    if (session) {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("full_name, company_name, website")
        .eq("id", session.user.id)
        .single()

      if (error) {
        console.error("Error fetching user profile:", error)
      } else {
        userStore.setUser({
          id: session.user.id,
          email: session.user.email,
          fullName: profile?.full_name ?? "",
          companyName: profile?.company_name ?? "",
          website: profile?.website ?? "",
        })
      }
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
<div class="mx-auto w-full max-w-4xl">
  <div>
    <!-- <h2 class="mt-2 text-2xl font-bold">Map Manager</h2> -->

    <MasterMapManager />
    <div class="flex items-center space-x-4">
      <div class="space-y-2"></div>
    </div>
    {#if $connectedMapStore.is_connected}
      <MapStats />
      <VehicleList />
    {/if}
  </div>
</div>
