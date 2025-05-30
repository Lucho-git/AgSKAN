<script lang="ts">
  export let href: string = "#"
  export let className: string = ""
</script>

<a
  {href}
  class="relative transition-colors duration-300 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-bottom-right after:scale-x-0 after:bg-secondary after:transition-transform after:duration-300 after:ease-in-out hover:text-secondary hover:after:origin-bottom-left hover:after:scale-x-100 {className}"
  on:click
>
  <slot />
</a>
