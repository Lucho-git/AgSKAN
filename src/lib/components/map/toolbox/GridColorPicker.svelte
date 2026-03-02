<!-- src/lib/components/map/toolbox/GridColorPicker.svelte -->
<script>
  import { createEventDispatcher } from "svelte"

  const dispatch = createEventDispatcher()

  export let showPicker = false
  export let selectedColor = "#FF0000"

  const colors = [
    { hex: "#FF0000", name: "Red" },
    { hex: "#00FF00", name: "Green" },
    { hex: "#0000FF", name: "Blue" },
    { hex: "#FFFF00", name: "Yellow" },
    { hex: "#FF00FF", name: "Magenta" },
    { hex: "#00FFFF", name: "Cyan" },
    { hex: "#FFA500", name: "Orange" },
    { hex: "#800080", name: "Purple" },
    { hex: "#008000", name: "Dark Green" },
    { hex: "#FFC0CB", name: "Pink" },
    { hex: "#A52A2A", name: "Brown" },
    { hex: "#808080", name: "Gray" },
  ]

  function selectColor(color) {
    selectedColor = color.hex
    dispatch("colorSelected", color.hex)
  }

  function closeModal() {
    showPicker = false
    dispatch("close")
  }

  $: selectedColorName =
    colors.find((c) => c.hex === selectedColor)?.name || "Custom"
</script>

{#if showPicker}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    on:click|self={closeModal}
  >
    <div class="rounded-lg bg-white p-4 shadow-lg">
      <div class="grid grid-cols-3 gap-2">
        {#each colors as color}
          <button
            class="flex h-24 w-24 transform flex-col items-center justify-center rounded-md transition-transform duration-200 ease-in-out hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            style="background-color: {color.hex};"
            on:click={() => selectColor(color)}
          >
            <span class="text-shadow text-xs font-bold text-white"
              >{color.name}</span
            >
          </button>
        {/each}
      </div>
      <p class="mt-4 text-center">Selected color: {selectedColorName}</p>
    </div>
  </div>
{/if}

<style>
  .text-shadow {
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  }
</style>
