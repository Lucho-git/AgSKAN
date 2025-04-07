<!-- App.svelte -->
<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte"
  import type { Writable } from "svelte/store"
  import FarmingSimulation from "../../../../../components/FarmingSimulation.svelte"
  import TypeFormSurvey from "../../../../../components/TypeFormSurvey.svelte"
  import FeatheryForm from "../../../../../components/FeatheryForm.svelte"
  import FarmDataAnimation from "../../../../../components/FarmDataAnimation.svelte"
  import FarmDataGsap from "./FarmDataGSAP.svelte"
  import MapViewer from "../../../../../components/MapViewer.svelte"
  import StubContainer from "../../../../../components/StubContainer.svelte"

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("pathplanner")
</script>

<div class="app-container">
  <div class="mx-auto w-full max-w-4xl">
    <div class="alert alert-info mb-4 mt-2 w-full">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        class="h-6 w-6 shrink-0 stroke-current"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        ></path></svg
      >
      <div>
        <h3 class="font-bold">Coming Later: PathPlanner Feature</h3>
        <div class="text-sm">
          We're working on an exciting new PathPlanner feature. Stay tuned for
          updates!
        </div>
      </div>
    </div>

    <FarmDataGsap />
  </div>
</div>

<style>
  .app-container {
    display: flex;
    width: 100%;
    min-height: 100vh;
    padding: 1rem;
  }
</style>
