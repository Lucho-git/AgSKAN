<!-- src/lib/components/map/markers/PhotoLightbox.svelte -->
<!-- Full-screen PhotoSwipe 5 lightbox for marker photos. Replaces the old
     hand-rolled viewer: bounded pan/zoom (edges stick to the viewport),
     swipe navigation between photos, pinch zoom, mouse-wheel zoom and
     keyboard navigation are all built in. -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { createEventDispatcher } from "svelte"
  import PhotoSwipe from "photoswipe"
  import PhotoSwipeLightbox from "photoswipe/lightbox"
  import "photoswipe/style.css"
  import { Capacitor } from "@capacitor/core"
  import { Filesystem, Directory } from "@capacitor/filesystem"
  import { Share } from "@capacitor/share"
  import { toast } from "svelte-sonner"

  export let photos: { id: string; path: string; url: string }[] = []
  export let index = 0

  const dispatch = createEventDispatcher<{ close: void }>()

  let lightbox: PhotoSwipeLightbox | null = null

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(",")[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async function downloadCurrent() {
    const item = lightbox?.pswp?.currSlide?.data as any
    if (!item?.src) return
    try {
      const res = await fetch(item.src)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const ext = blob.type === "image/png" ? "png" : "jpg"
      const name = `marker-photo-${item.id || Date.now()}.${ext}`

      if (Capacitor.isNativePlatform()) {
        // Mobile: write to cache then open the share sheet so the user can
        // save it to their device.
        const base64 = await blobToBase64(blob)
        const saved = await Filesystem.writeFile({
          path: name,
          data: base64,
          directory: Directory.Cache,
        })
        await Share.share({
          title: "Marker photo",
          text: "Marker photo from AgSKAN",
          url: saved.uri,
          dialogTitle: "Save or share photo",
        })
        toast.success("Photo ready — save it from the share sheet")
      } else {
        // Web/desktop: trigger a normal file download.
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success("Photo downloaded")
      }
    } catch (error) {
      console.error("Photo download failed:", error)
      toast.error("Couldn't download photo")
    }
  }

  onMount(async () => {
    if (!photos.length) return
    // Preload natural dimensions so the initial zoom animation frames correctly.
    const items = await Promise.all(
      photos.map(
        (p) =>
          new Promise<{ src: string; width: number; height: number; id: string }>(
            (resolve) => {
              const img = new Image()
              img.onload = () =>
                resolve({ src: p.url, width: img.naturalWidth, height: img.naturalHeight, id: p.id })
              img.onerror = () => resolve({ src: p.url, width: 1200, height: 800, id: p.id })
              img.src = p.url
            },
          ),
      ),
    )
    const start = Math.max(0, Math.min(index, items.length - 1))

    const lb = new PhotoSwipeLightbox({
      dataSource: items,
      index: start,
      pswpModule: PhotoSwipe,
      bgOpacity: 0.9,
      showHideAnimationType: "zoom",
      closeOnVerticalDrag: true,
      wheelToZoom: true,
    })

    // Download button (top-left), matching the old viewer's placement.
    lb.on("uiRegister", () => {
      const pswp = lb.pswp
      if (!pswp) return
      pswp.ui.registerElement({
        name: "agskan-download-button",
        order: 9,
        isButton: true,
        html:
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--pswp-icon-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 1px 1px rgba(0,0,0,0.8));"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        title: "Download photo",
        ariaLabel: "Download photo",
        onClick: () => {
          downloadCurrent()
        },
      })
    })

    lb.on("close", () => {
      dispatch("close")
    })

    lb.init()
    lightbox = lb
    lb.loadAndOpen(start)
  })

  onDestroy(() => {
    if (lightbox) {
      try {
        lightbox.destroy()
      } catch (e) {
        console.error("PhotoSwipe destroy failed:", e)
      }
      lightbox = null
    }
  })
</script>

<!-- PhotoSwipe renders its own full-screen overlay -->
