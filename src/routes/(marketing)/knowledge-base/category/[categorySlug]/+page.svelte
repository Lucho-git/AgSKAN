<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    ChevronDown,
    Search,
  } from "lucide-svelte"
  import { page } from "$app/stores"
  import { onMount } from "svelte"
  import { getArticlesByCategory, type Article } from "$lib/data/articleData"

  let mounted = false
  let searchTerm = ""
  let expandedArticles: Set<string> = new Set()

  // Access the category slug parameter from the URL
  $: categorySlug = $page.params.categorySlug
  $: articles = getArticlesByCategory(categorySlug)
  $: categoryName = articles.length > 0 ? articles[0].category : categorySlug
  $: filteredArticles = articles.filter(
    (article) =>
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.content.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  onMount(() => {
    mounted = true
    window.scrollTo(0, 0)
  })

  function toggleArticle(articleId: string) {
    if (expandedArticles.has(articleId)) {
      expandedArticles.delete(articleId)
    } else {
      expandedArticles.add(articleId)
    }
    expandedArticles = expandedArticles
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
</script>

<svelte:head>
  <title>{categoryName} - Knowledge Base - AgSKAN</title>
  <meta
    name="description"
    content="Browse {categoryName} articles and guides for AgSKAN."
  />
</svelte:head>

<main class="overflow-x-hidden bg-base-100 pb-16 pt-28 text-contrast-content">
  <div class="section-container mx-auto max-w-4xl">
    {#if mounted}
      <!-- Breadcrumbs -->
      <nav class="mb-6 flex py-3 text-sm" in:animationDelay={0}>
        <ol class="inline-flex items-center space-x-1 md:space-x-3">
          <li class="inline-flex items-center">
            <a
              href="/knowledge-base"
              class="inline-flex items-center text-base-content hover:text-base-content/80"
            >
              <BookOpen size={16} class="mr-2" />
              Knowledge Base
            </a>
          </li>
          <li aria-current="page">
            <div class="flex items-center">
              <span class="mx-2 text-contrast-content/50">/</span>
              <span class="text-contrast-content/70">{categoryName}</span>
            </div>
          </li>
        </ol>
      </nav>

      <div in:animationDelay={100}>
        <h1 class="mb-4 font-sans text-4xl font-bold text-contrast-content">
          {categoryName}
        </h1>
        <p class="mb-8 text-lg text-contrast-content/80">
          Find comprehensive guides and answers for {categoryName.toLowerCase()}.
        </p>

        <!-- Search box -->
        <div class="relative mb-8">
          <div
            class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4"
          >
            <Search size={18} class="text-contrast-content/50" />
          </div>
          <input
            type="text"
            placeholder="Search this category..."
            class="w-full rounded-lg border border-base-300 bg-base-100 py-3 pl-12 pr-4 text-contrast-content focus:outline-none focus:ring-2 focus:ring-base-content"
            bind:value={searchTerm}
          />
        </div>

        <!-- Articles list -->
        <h2 class="mb-6 font-sans text-2xl font-bold text-contrast-content">
          Articles in this category
        </h2>

        {#if filteredArticles.length === 0}
          <div class="rounded-xl bg-base-200 p-8 text-center">
            <h3 class="mb-3 text-xl font-bold text-contrast-content">
              No articles found
            </h3>
            <p class="text-contrast-content/70">
              Try using different keywords or browse all categories.
            </p>
          </div>
        {:else}
          <div class="space-y-4">
            {#each filteredArticles as article, index}
              <div
                class="overflow-hidden rounded-lg bg-base-200 shadow-sm"
                in:animationDelay={200 + index * 50}
              >
                <button
                  class="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-base-300"
                  on:click={() => toggleArticle(article.id)}
                >
                  <h3 class="text-xl font-semibold text-contrast-content">
                    {article.title}
                  </h3>
                  <ChevronDown
                    size={20}
                    class={`text-contrast-content/60 transition-transform ${expandedArticles.has(article.id) ? "rotate-180" : ""}`}
                  />
                </button>

                {#if expandedArticles.has(article.id)}
                  <div class="border-t border-base-300 px-6 pb-6">
                    <p class="mb-4 mt-4 text-contrast-content/80">
                      {article.excerpt}
                    </p>
                    <a
                      href={`/knowledge-base/article/${article.slug}`}
                      class="inline-flex items-center font-medium text-base-content hover:text-base-content/80"
                    >
                      Read full article
                      <ArrowRight size={16} class="ml-2" />
                    </a>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Need help section -->
        <div
          class="my-8 rounded-xl bg-base-200 p-8 text-center"
          in:animationDelay={300}
        >
          <h3 class="mb-4 text-xl font-bold text-contrast-content">
            Need personalized help?
          </h3>
          <p class="mb-6 text-contrast-content/80">
            If you couldn't find the answer you were looking for, our support
            team is here to help.
          </p>
          <a
            href="/contact-us"
            class="btn btn-secondary inline-flex items-center"
          >
            Contact Support
            <ArrowRight size={18} class="ml-2" />
          </a>
        </div>

        <!-- Back to Knowledge Base -->
        <div class="mt-8 text-center" in:animationDelay={400}>
          <a
            href="/knowledge-base"
            class="btn btn-outline inline-flex items-center"
          >
            <ArrowLeft size={18} class="mr-2" />
            Back to Knowledge Base
          </a>
        </div>
      </div>
    {/if}
  </div>
</main>
