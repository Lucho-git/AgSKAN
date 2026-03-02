<!-- src/lib/components/general/TypeFormSurvey.svelte -->
<script>
  import { onMount } from "svelte"

  export let surveyId = "01HSBV7RR38VKBR6W3DC621CAJ"

  onMount(() => {
    const script = document.createElement("script")
    script.src = "//embed.typeform.com/next/embed.js"
    document.head.appendChild(script)
  })
</script>

<div class="rounded-lg bg-white p-4 shadow-md">
  <div data-tf-live={surveyId}></div>
</div>
