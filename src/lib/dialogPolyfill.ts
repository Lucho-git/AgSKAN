// src/lib/dialogPolyfill.ts
//
// Global polyfill for the native <dialog> element — every modal in the app
// (field export / delete / edit / upload, vehicle list, admin, team invite,
// agworld, …) is a native <dialog> opened via `.showModal()`.
//
// `HTMLDialogElement.showModal()/close()` were only added to Safari, iOS and
// WKWebView in 15.4 (March 2022). On older Safari-family devices — an older
// Mac's Safari, or the Capacitor app running in an older WKWebView — every
// `.showModal()` call throws `TypeError: showModal is not a function`, so
// modals like the field "Export Fields" dialog never open even though the
// page itself works fine.
//
// This registers each <dialog> with `dialog-polyfill` (a battle-tested
// polyfill that adds showModal/close, a backdrop, ESC + focus handling and
// `form[method="dialog"]` support). `registerDialog` is a NO-OP on browsers
// that already support the native element, so modern browsers are completely
// unaffected — the observer is only installed when support is missing.
import { browser } from "$app/environment"
import dialogPolyfill from "dialog-polyfill"

let started = false

/**
 * Makes native <dialog> modals work on browsers without showModal()/close()
 * (Safari / iOS / WKWebView < 15.4). Safe to call repeatedly; a no-op on
 * modern browsers. Call once on the client (e.g. the root layout onMount).
 */
export function initDialogPolyfill(): void {
  if (!browser || started) return
  started = true

  // Modern browsers (Chrome/Edge/Firefox/Safari 15.4+) already support the
  // native element — nothing to polyfill, don't even attach the observer.
  const nativeDialog =
    typeof window !== "undefined" ? window.HTMLDialogElement : undefined
  if (
    nativeDialog &&
    typeof nativeDialog.prototype.showModal === "function"
  ) {
    return
  }

  // Only old browsers load the polyfill stylesheet (backdrop + base dialog
  // styles; DaisyUI's .modal classes override the base rules).
  void import("dialog-polyfill/dist/dialog-polyfill.css").catch(() => {
    /* stylesheet is best-effort */
  })

  const register = (el: Element): void => {
    try {
      // No-op when the element already has showModal — safe to call again.
      dialogPolyfill.registerDialog(el)
    } catch (e) {
      console.warn("dialog-polyfill:", e)
    }
  }

  // Dialogs already in the DOM (SSR'd + hydrated).
  document.querySelectorAll("dialog").forEach(register)

  // Svelte renders and swaps modals at any time (navigation, {#if} blocks),
  // so watch for new <dialog> elements and register them on the fly.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        if (node.tagName === "DIALOG") register(node)
        node.querySelectorAll("dialog").forEach(register)
      }
    }
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}
