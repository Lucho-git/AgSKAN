<script lang="ts">
  /** Decorative contour-line backdrop. Sits behind a section's content. */
  import { parallax } from "./motion"

  /** Parallax depth; 0 disables. */
  export let depth = 0.05
  export let flip = false
</script>

<div class="wrap" aria-hidden="true">
  <div class="drift" use:parallax={depth}>
    <svg
      viewBox="0 0 1200 900"
      preserveAspectRatio="xMidYMid slice"
      style={flip ? "transform: scaleX(-1)" : ""}
    >
      <g fill="none" stroke="var(--lp-contour)" stroke-width="1.6">
        <path d="M-80,160 C180,60 330,300 560,230 S940,20 1280,170" />
        <path d="M-80,260 C200,170 340,410 590,330 S960,130 1280,290" />
        <path d="M-80,380 C220,300 380,540 640,450 S990,270 1280,430" />
        <path d="M-80,520 C240,450 420,690 700,590 S1010,430 1280,590" />
        <path d="M-80,680 C260,620 470,850 760,740 S1040,610 1280,760" />
        <path d="M760,-60 C690,150 930,270 870,470 S1010,790 930,980" />
        <path d="M900,-60 C840,160 1070,290 1010,480 S1140,790 1080,980" />
        <path d="M150,-60 C230,120 60,280 150,470 S20,760 110,980" />
      </g>
    </svg>
  </div>
</div>

<style>
  .wrap {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .drift {
    position: absolute;
    inset: -12% 0;
  }
  svg {
    width: 100%;
    height: 100%;
  }
</style>
