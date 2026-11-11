/**
 * Small motion helpers for the landing page: scroll-reveal and transform-based
 * parallax. Both no-op when the visitor prefers reduced motion.
 */

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Fade/slide an element in the first time it scrolls into view. */
export function reveal(node: HTMLElement, delay = 0) {
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) return {}

  node.style.setProperty("--lp-reveal-delay", `${delay}ms`)
  node.classList.add("lp-reveal-ready")

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          node.classList.add("lp-reveal-in")
          observer.disconnect()
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  )
  observer.observe(node)

  return {
    destroy() {
      observer.disconnect()
    },
  }
}

type ParallaxItem = { node: HTMLElement; depth: number }
const parallaxItems = new Set<ParallaxItem>()
let ticking = false
let listening = false

function updateParallax() {
  ticking = false
  const viewportH = window.innerHeight
  for (const item of parallaxItems) {
    const rect = item.node.parentElement?.getBoundingClientRect()
    if (!rect || rect.bottom < -200 || rect.top > viewportH + 200) continue
    // Distance of the parent's centre from the viewport centre.
    const offset = rect.top + rect.height / 2 - viewportH / 2
    item.node.style.transform = `translate3d(0, ${(-offset * item.depth).toFixed(1)}px, 0)`
  }
}

function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(updateParallax)
}

/**
 * Shift an element against the scroll by `depth` (0.05 = far, 0.25 = near).
 * Uses transforms only, driven from one shared rAF-throttled scroll listener.
 */
export function parallax(node: HTMLElement, depth = 0.1) {
  if (prefersReducedMotion()) return {}

  const item = { node, depth }
  parallaxItems.add(item)
  node.style.willChange = "transform"

  if (!listening) {
    listening = true
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
  }
  onScroll()

  return {
    update(next: number) {
      item.depth = next
      onScroll()
    },
    destroy() {
      parallaxItems.delete(item)
      if (parallaxItems.size === 0 && listening) {
        listening = false
        window.removeEventListener("scroll", onScroll)
        window.removeEventListener("resize", onScroll)
      }
    },
  }
}
