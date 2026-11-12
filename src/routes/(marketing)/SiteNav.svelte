<script lang="ts">
  /**
   * Marketing header. One job: get people into the app.
   *
   * Small screens show the logo and a single Join / Dashboard button. Section
   * links only appear from 1024px up. The previous header is kept in
   * OGNavbar.svelte.
   */
  import { onMount } from "svelte"
  import { ArrowRight, Moon, Sun } from "lucide-svelte"
  import { session } from "$lib/stores/sessionStore"

  /** Auth pages: logo and theme toggle only. */
  export let minimal = false

  const links = [
    { href: "/#setup", label: "How it works" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/#qanda", label: "FAQ" },
    { href: "/team", label: "About" },
    { href: "/knowledge-base", label: "Help" },
  ]

  let isDarkMode = true
  let scrolled = false

  onMount(() => {
    const savedTheme = localStorage.getItem("theme") ?? "skanthemedark"
    document.documentElement.setAttribute("data-theme", savedTheme)
    isDarkMode = savedTheme === "skanthemedark"

    const onScroll = () => (scrolled = window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  })

  function toggleTheme() {
    isDarkMode = !isDarkMode
    const theme = isDarkMode ? "skanthemedark" : "skantheme"
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("theme", theme)
  }
</script>

<header class="nav" class:scrolled>
  <div class="section-container bar">
    <a href="/" class="brand" aria-label="AgSKAN home">
      <span class="mark">
        <img src="/images/logo.svg" alt="" width="40" height="40" />
      </span>
      <span class="word">AgSKAN</span>
    </a>

    {#if !minimal}
      <nav class="links" aria-label="Main">
        {#each links as link}
          <a href={link.href}>{link.label}</a>
        {/each}
      </nav>
    {/if}

    <div class="actions">
      <button
        type="button"
        class="theme"
        on:click={toggleTheme}
        aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        {#if isDarkMode}
          <Sun size={19} />
        {:else}
          <Moon size={19} />
        {/if}
      </button>

      {#if !minimal}
        {#if !$session}
          <a href="/login" class="login">Log in</a>
        {/if}
        <!-- The sign-up page sends signed-in visitors straight to /account. -->
        <a href="/login?tab=sign_up" class="join">
          {$session ? "Dashboard" : "Join free"}
          <ArrowRight size={16} />
        </a>
      {/if}
    </div>
  </div>
</header>

<style>
  .nav {
    position: sticky;
    top: 0;
    z-index: 50;
    border-bottom: 1px solid transparent;
    background: color-mix(in srgb, var(--lp-paper) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition: border-color 0.2s ease;
  }
  .nav.scrolled {
    border-bottom-color: var(--lp-line);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    height: 4rem;
  }

  .brand {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.55rem;
  }
  .mark {
    display: flex;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.7rem;
    background: var(--lp-yellow);
  }
  .mark img {
    width: 100%;
    height: 100%;
  }
  .word {
    font-family: "Archivo", "Montserrat", ui-sans-serif, system-ui, sans-serif;
    font-size: 1.45rem;
    font-weight: 900;
    line-height: 1;
    color: var(--lp-ink);
  }

  .links {
    display: none;
  }
  .links a {
    padding: 0.5rem 0.2rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--lp-ink-soft);
    transition: color 0.2s ease;
  }
  .links a:hover {
    color: var(--lp-ink);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    color: var(--lp-ink-soft);
  }
  .theme:hover {
    color: var(--lp-ink);
  }
  .login {
    display: none;
    align-items: center;
    min-height: 2.75rem;
    padding: 0 0.7rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--lp-ink);
  }
  .login:hover {
    text-decoration: underline;
  }
  .join {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0 1.1rem;
    border-radius: 999px;
    background: var(--lp-yellow);
    color: #15261c;
    font-size: 0.95rem;
    font-weight: 700;
    white-space: nowrap;
    transition: transform 0.2s ease;
  }
  .join:hover {
    transform: translateY(-1px);
  }
  .join:focus-visible,
  .login:focus-visible,
  .theme:focus-visible,
  .links a:focus-visible {
    outline: 2px solid var(--lp-accent-text);
    outline-offset: 2px;
  }

  @media (min-width: 480px) {
    .login {
      display: inline-flex;
    }
  }
  @media (min-width: 1024px) {
    .links {
      display: flex;
      gap: 1.6rem;
    }
    .actions {
      gap: 0.6rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .join,
    .nav {
      transition: none;
    }
  }
</style>
