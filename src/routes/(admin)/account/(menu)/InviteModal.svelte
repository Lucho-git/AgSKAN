<script>
  import Icon from "@iconify/svelte"
  import InviteTeamModal from "$lib/components/general/InviteTeamModal.svelte"

  let open = false
</script>

<!-- Invite Button -->
<button class="btn btn-circle btn-primary btn-sm" on:click={() => (open = true)}>
  <Icon icon="mdi:plus" width="24" height="24" />
</button>

<InviteTeamModal bind:open />
