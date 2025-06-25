<script>
  import { page } from "$app/stores"
  import { goto } from "$app/navigation"

  // Only show back button for sub-routes, not the main settings page
  $: isSettingsSubpage =
    $page.url.pathname !== "/account/settings" &&
    $page.url.pathname.startsWith("/account/settings")

  // Extract the subpage title from the URL for breadcrumb display
  $: subpageTitle = isSettingsSubpage
    ? $page.url.pathname
        .split("/")
        .pop()
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : ""
</script>

{#if isSettingsSubpage}
  <nav class="breadcrumbs mb-5 text-sm">
    <ul>
      <li>
        <a
          href="/account/settings"
          class="flex items-center gap-1 text-gray-600 hover:text-primary"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="h-4 w-4"
          >
            <path
              d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.963 8.963 0 00-4.25 1.065V16.82zM9.25 4.065A8.963 8.963 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11c0 .332.22.624.546.721.857.196 1.74.3 2.654.3a7.45 7.45 0 004.05-1.18V4.065z"
            />
          </svg>
          Settings
        </a>
      </li>
      <li class="font-semibold">{subpageTitle}</li>
    </ul>
  </nav>
{/if}

<!-- Render the page content -->
<slot />
