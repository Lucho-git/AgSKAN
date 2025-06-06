<script lang="ts">
  export let href: string = "#"
  export let className: string = ""
  export let target: string | undefined = undefined
</script>

<a
  {href}
  {target}
  class="relative transition-colors duration-300 after:absolute after:bottom-0 after:left-0 after:h-[0.5px] after:w-full after:origin-bottom-right after:scale-x-0 after:bg-base-content after:transition-transform after:duration-300 after:ease-in-out hover:text-base-content hover:after:origin-bottom-left hover:after:scale-x-100 {className}"
  on:click
>
  <slot />
</a>
