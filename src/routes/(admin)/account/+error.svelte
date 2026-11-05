<!-- src/routes/(admin)/account/+error.svelte -->
<!-- Error boundary for the signed-in area: anything that throws on the way
     into a screen lands here rather than on the generic "Internal Error"
     page, and reads correctly when the cause is simply no signal. -->
<script lang="ts">
  import { page } from "$app/stores"
  import ConnectionErrorPanel from "$lib/components/general/ConnectionErrorPanel.svelte"
</script>

<ConnectionErrorPanel
  headline="This screen didn't load"
  detail={$page.error?.message ||
    "We hit an unexpected error loading this screen."}
  status={$page.error?.status}
  secondaryHref="/account/"
  secondaryLabel="Dashboard"
/>
