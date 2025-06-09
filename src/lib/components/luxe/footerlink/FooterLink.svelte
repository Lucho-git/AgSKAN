<script lang="ts">
  export let href: string = "#"
  export let className: string = ""
  export let target: string | undefined = undefined
</script>

<a
  {href}
  {target}
  class="group relative text-neutral-content/80 transition-colors duration-300 hover:text-hover {className}"
  on:click
>
  <slot />
  <span
    class="absolute bottom-0 left-0 h-[0.5px] w-full origin-bottom-right scale-x-0 bg-hover transition-transform duration-300 ease-in-out group-hover:origin-bottom-left group-hover:scale-x-100"
  ></span>
</a>
