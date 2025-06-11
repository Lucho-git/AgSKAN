<script lang="ts">
  import {
    ArrowRight,
    BookOpen,
    ChevronRight,
    CircleHelp,
    Search,
    Settings,
    Zap,
  } from "lucide-svelte"
  import { onMount } from "svelte"
  import { getArticlesByCategory, searchArticles } from "$lib/data/articleData"
  import { goto } from "$app/navigation"

  let mounted = false
  let searchQuery = ""
  let searchResults = []
  let showSearchResults = false

  onMount(() => {
    mounted = true
    window.scrollTo(0, 0)
  })

  // Handle search functionality
  function handleSearch() {
    if (searchQuery.trim()) {
      searchResults = searchArticles(searchQuery)
      showSearchResults = true
    } else {
      showSearchResults = false
      searchResults = []
    }
  }

  // Handle search on Enter key
  function handleKeyPress(event) {
    if (event.key === "Enter") {
      handleSearch()
    }
  }

  // Clear search
  function clearSearch() {
    searchQuery = ""
    showSearchResults = false
    searchResults = []
  }

  // Animation delay placeholder
  function animationDelay(node: HTMLElement, delay: number) {
    return {
      delay,
      duration: 600,
      css: (t: number) => `
        opacity: ${t};
        transform: translateY(${(1 - t) * 20}px);
      `,
    }
  }

  const categories = [
    {
      title: "Getting Started",
      slug: "getting-started",
      icon: Zap,
      color: "text-blue-600 bg-blue-100",
      articles: getArticlesByCategory("Getting Started"),
    },
    {
      title: "Troubleshooting",
      slug: "troubleshooting",
      icon: Settings,
      color: "text-orange-600 bg-orange-100",
      articles: getArticlesByCategory("Troubleshooting"),
    },
    {
      title: "FAQs",
      slug: "faqs",
      icon: CircleHelp,
      color: "text-purple-600 bg-purple-100",
      articles: getArticlesByCategory("FAQs"),
    },
  ]
</script>

<svelte:head>
  <title>Knowledge Base - AgSKAN</title>
  <meta
    name="description"
    content="Find answers to your questions about AgSKAN and how to get the most out of it."
  />
</svelte:head>

<main class="overflow-x-hidden bg-base-100 text-contrast-content">
  <!-- Hero Section -->
  <section class="bg-gradient-to-b from-base-100 to-base-200 pb-8 pt-36">
    <div class="section-container">
      {#if mounted}
        <div class="mx-auto max-w-3xl pb-8 text-center" in:animationDelay={0}>
          <h1
            class="mb-8 font-sans text-4xl font-bold text-contrast-content md:text-5xl"
          >
            Knowledge Base
          </h1>
          <p
            class="mx-auto mb-12 max-w-2xl text-lg text-contrast-content/80 md:text-xl"
          >
            Find answers to your questions about AgSKAN and how to get the most
            out of it.
          </p>

          <div class="relative mx-auto max-w-2xl">
            <div
              class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5"
            >
              <Search size={18} class="text-contrast-content/50" />
            </div>
            <input
              type="text"
              placeholder="Search our articles..."
              class="w-full rounded-xl border border-base-300 bg-base-100 py-4 pl-12 pr-16 text-contrast-content shadow-sm focus:outline-none focus:ring-2 focus:ring-base-content"
              bind:value={searchQuery}
              on:input={handleSearch}
              on:keypress={handleKeyPress}
            />
            <button
              class="absolute inset-y-0 right-0 flex items-center px-5 font-medium text-base-content transition-colors hover:text-base-content/80"
              on:click={handleSearch}
            >
              Search
              <ArrowRight size={18} class="ml-2" />
            </button>

            <!-- Search Results Dropdown -->
            {#if showSearchResults}
              <div
                class="absolute left-0 right-0 top-full z-10 mt-2 max-h-96 overflow-y-auto rounded-xl border border-base-300 bg-base-100 shadow-lg"
              >
                {#if searchResults.length > 0}
                  <div class="p-2">
                    <div
                      class="border-b border-base-300 px-3 py-2 text-sm text-contrast-content/70"
                    >
                      Found {searchResults.length} article{searchResults.length !==
                      1
                        ? "s"
                        : ""}
                    </div>
                    {#each searchResults as article}
                      <a
                        href={`/knowledge-base/article/${article.slug}`}
                        class="group block rounded-lg px-3 py-3 transition-colors hover:bg-base-200"
                        on:click={clearSearch}
                      >
                        <div class="flex items-start gap-3">
                          <BookOpen
                            size={16}
                            class="mt-1 flex-shrink-0 text-contrast-content/60"
                          />
                          <div>
                            <div
                              class="font-medium text-contrast-content group-hover:text-base-content"
                            >
                              {article.title}
                            </div>
                            <div class="mt-1 text-sm text-contrast-content/70">
                              {article.excerpt}
                            </div>
                            <div class="mt-1 text-xs text-contrast-content/50">
                              {article.category}
                            </div>
                          </div>
                        </div>
                      </a>
                    {/each}
                  </div>
                {:else}
                  <div class="p-6 text-center">
                    <div class="text-contrast-content/70">
                      No articles found for "{searchQuery}"
                    </div>
                    <button
                      class="mt-2 text-sm text-base-content hover:text-base-content/80"
                      on:click={clearSearch}
                    >
                      Clear search
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Categories Section -->
  <section class="bg-base-100 pb-16 pt-8">
    <div class="section-container">
      {#if mounted && !showSearchResults}
        <div class="grid gap-10 md:grid-cols-3" in:animationDelay={100}>
          {#each categories as category, idx}
            <div
              class="rounded-xl bg-base-200 p-6 shadow-sm transition-shadow hover:shadow-md md:p-8"
            >
              <div class="mb-8 flex items-center gap-4">
                <div
                  class={`flex h-10 w-10 items-center justify-center rounded-full ${category.color}`}
                >
                  <svelte:component this={category.icon} size={20} />
                </div>
                <h2 class="font-sans text-xl font-bold text-contrast-content">
                  {category.title}
                </h2>
              </div>

              <ul class="mt-4 space-y-2">
                {#each category.articles.slice(0, 4) as article}
                  <li class="my-2">
                    <a
                      href={`/knowledge-base/article/${article.slug}`}
                      class="group flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-base-100"
                    >
                      <div class="flex items-start gap-3">
                        <BookOpen
                          size={16}
                          class="mt-1 flex-shrink-0 text-contrast-content/60"
                        />
                        <span
                          class="text-contrast-content/80 transition-colors group-hover:text-base-content"
                        >
                          {article.title}
                        </span>
                      </div>
                      <ChevronRight
                        size={16}
                        class="flex-shrink-0 text-contrast-content/60 transition-colors group-hover:text-base-content"
                      />
                    </a>
                  </li>
                {/each}
              </ul>

              <div class="mt-6 text-center">
                <a
                  href={`/knowledge-base/category/${category.slug}`}
                  class="inline-flex items-center font-medium text-base-content transition-colors hover:text-base-content/80"
                >
                  View all articles
                  <ArrowRight size={18} class="ml-2" />
                </a>
              </div>
            </div>
          {/each}
        </div>

        <div
          class="mx-auto mt-16 max-w-3xl rounded-xl bg-secondary/10 px-8 py-10 text-center shadow-sm"
          in:animationDelay={200}
        >
          <h2 class="mb-4 font-sans text-2xl font-bold text-contrast-content">
            Need personalized help?
          </h2>
          <p class="mx-auto mb-8 max-w-xl text-contrast-content/80">
            Our support team is ready to assist you with any specific questions
            or challenges you're facing.
          </p>
          <a
            href="mailto:support@skanfarming.com.au"
            class="btn btn-secondary inline-flex items-center px-8 py-3"
          >
            Contact Support
            <ArrowRight size={18} class="ml-2" />
          </a>
        </div>
      {:else if mounted && showSearchResults}
        <!-- Search Results View -->
        <div class="mx-auto max-w-4xl" in:animationDelay={100}>
          <div class="mb-8 flex items-center justify-between">
            <div>
              <h2 class="text-2xl font-bold text-contrast-content">
                Search Results
              </h2>
              <p class="text-contrast-content/70">
                Found {searchResults.length} article{searchResults.length !== 1
                  ? "s"
                  : ""} for "{searchQuery}"
              </p>
            </div>
            <button class="btn btn-outline text-sm" on:click={clearSearch}>
              Clear Search
            </button>
          </div>

          {#if searchResults.length > 0}
            <div class="grid gap-6 md:grid-cols-2">
              {#each searchResults as article, index}
                <div
                  class="rounded-xl bg-base-200 p-6 transition-all hover:shadow-md"
                  in:animationDelay={200 + index * 50}
                >
                  <div class="mb-4 flex items-start gap-4">
                    <div
                      class="flex h-12 w-12 items-center justify-center rounded-lg bg-base-content/10"
                    >
                      <BookOpen size={20} class="text-base-content" />
                    </div>
                    <div class="flex-1">
                      <div class="mb-1 text-xs text-contrast-content/60">
                        {article.category}
                      </div>
                      <h3 class="mb-2 font-semibold text-contrast-content">
                        {article.title}
                      </h3>
                      <p class="mb-3 text-sm text-contrast-content/80">
                        {article.excerpt}
                      </p>
                      <div
                        class="flex items-center text-xs text-contrast-content/60"
                      >
                        <span>{article.readTime}</span>
                        <span class="mx-2">•</span>
                        <span>{article.lastUpdated}</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href={`/knowledge-base/article/${article.slug}`}
                    class="btn btn-outline btn-sm w-full"
                  >
                    Read Article
                  </a>
                </div>
              {/each}
            </div>
          {:else}
            <div class="rounded-xl bg-base-200 py-16 text-center">
              <div
                class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-base-300"
              >
                <Search size={32} class="text-contrast-content/50" />
              </div>
              <h3 class="mb-3 text-xl font-bold text-contrast-content">
                No articles found
              </h3>
              <p class="mb-6 text-contrast-content/70">
                Try using different keywords or browse our categories below.
              </p>
              <button class="btn btn-secondary" on:click={clearSearch}>
                Browse Categoriess
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </section>
</main>
