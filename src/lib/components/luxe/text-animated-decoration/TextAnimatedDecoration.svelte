<script lang="ts">
  export let href: string = "#"
  export let className: string = ""
  export let underlineColor: string = "base-content" // Default to base-content
</script>

<a
  {href}
  class="relative transition-colors duration-300 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:origin-bottom-right after:scale-x-0 after:bg-{underlineColor} after:transition-transform after:duration-300 after:ease-in-out hover:text-{underlineColor} hover:after:origin-bottom-left hover:after:scale-x-100 {className}"
  on:click
>
  <slot />
</a>
