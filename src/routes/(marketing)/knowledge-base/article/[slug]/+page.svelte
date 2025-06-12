<script lang="ts">
  import { page } from "$app/stores"
  import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    ChevronRight,
    ThumbsDown,
    ThumbsUp,
  } from "lucide-svelte"
  import { onMount } from "svelte"
  import {
    getArticleBySlug,
    getRelatedArticles,
    type Article,
  } from "$lib/data/articleData"
  import { goto } from "$app/navigation"

  let mounted = false
  let article: Article | undefined
  let relatedArticles: Article[] = []
  let helpfulFeedback: boolean | null = null

  // Access the slug parameter from the URL
  $: slug = $page.params.slug

  onMount(() => {
    mounted = true
    window.scrollTo(0, 0)
  })

  // Reactive statement that runs when slug changes
  $: if (slug) {
    const foundArticle = getArticleBySlug(slug)
    if (foundArticle) {
      article = foundArticle
      relatedArticles = getRelatedArticles(slug)
    } else {
      // If article not found, redirect to knowledge base
      goto("/knowledge-base")
    }
  }

  function handleHelpfulFeedback(helpful: boolean) {
    helpfulFeedback = helpful
    console.log(`User found article ${helpful ? "helpful" : "not helpful"}`)
  }

  // Function to process article content and convert internal links
  function processContent(content: string): string {
    // Convert markdown-style internal links to HTML
    return content.replace(
      /\[([^\]]+)\]\(\/knowledge-base\/article\/([^)]+)\)/g,
      '<a href="/knowledge-base/article/$2" class="text-base-content hover:text-base-content/80 underline">$1</a>',
    )
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
  <title>{article?.title || "Article"} - Knowledge Base - AgSKAN</title>
  <meta
    name="description"
    content={article?.excerpt || "AgSKAN knowledge base article"}
  />
</svelte:head>

<main class="overflow-x-hidden bg-base-100 text-contrast-content">
  <div class="pb-16 pt-28">
    <div class="section-container mx-auto max-w-4xl">
      {#if mounted && article}
        <!-- Breadcrumb -->
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
            <li>
              <div class="flex items-center">
                <ChevronRight size={16} class="text-contrast-content/50" />
                <a
                  href={`/knowledge-base/category/${article.categorySlug}`}
                  class="ml-1 text-base-content hover:text-base-content/80"
                >
                  {article.category}
                </a>
              </div>
            </li>
            <li aria-current="page">
              <div class="flex items-center">
                <ChevronRight size={16} class="text-contrast-content/50" />
                <span class="ml-1 text-contrast-content/70">
                  {article.title}
                </span>
              </div>
            </li>
          </ol>
        </nav>

        <!-- Article Header -->
        <header
          class="mb-8 border-b border-base-300 pb-6"
          in:animationDelay={100}
        >
          <h1
            class="mb-4 font-sans text-3xl font-bold text-contrast-content md:text-4xl"
          >
            {article.title}
          </h1>
          <div class="flex items-center text-sm text-contrast-content/60">
            <time datetime="2025-05-09"
              >Last updated: {article.lastUpdated}</time
            >
            <span class="mx-2">•</span>
            <span>{article.readTime} read</span>
          </div>
        </header>

        <!-- Article Content with processed internal links -->
        <div class="prose prose-lg mb-8 max-w-none" in:animationDelay={200}>
          <div
            class="whitespace-pre-line text-lg leading-relaxed text-contrast-content/80"
          >
            {@html processContent(article.content)}
          </div>
        </div>

        <!-- Was this helpful section
        <div
          class="mb-10 border-t border-base-300 pt-6"
          in:animationDelay={300}
        >
          <h3 class="mb-4 text-lg font-medium text-contrast-content">
            Was this article helpful?
          </h3>
          <div class="flex space-x-4">
            <button
              class={`inline-flex items-center rounded-lg border px-4 py-2 transition-colors ${
                helpfulFeedback === true
                  ? "border-base-content bg-base-content text-base-100"
                  : "border-base-content text-base-content hover:bg-base-content/10"
              }`}
              on:click={() => handleHelpfulFeedback(true)}
            >
              <ThumbsUp size={18} class="mr-2" />
              Yes
            </button>
            <button
              class={`inline-flex items-center rounded-lg border px-4 py-2 transition-colors ${
                helpfulFeedback === false
                  ? "border-base-content bg-base-content text-base-100"
                  : "border-base-300 text-contrast-content hover:bg-base-200"
              }`}
              on:click={() => handleHelpfulFeedback(false)}
            >
              <ThumbsDown size={18} class="mr-2" />
              No
            </button>
          </div>
        </div> -->

        <!-- Related Articles -->
        {#if relatedArticles.length > 0}
          <div class="mb-10 rounded-xl bg-base-200 p-6" in:animationDelay={400}>
            <h3 class="mb-4 font-sans text-xl font-bold text-contrast-content">
              Related Articles
            </h3>
            <ul class="space-y-3">
              {#each relatedArticles as relatedArticle}
                <li>
                  <a
                    href={`/knowledge-base/article/${relatedArticle.slug}`}
                    class="group flex items-center text-base-content hover:text-base-content/80"
                  >
                    <BookOpen size={18} class="mr-3 flex-shrink-0" />
                    <span>{relatedArticle.title}</span>
                    <ArrowRight
                      size={16}
                      class="ml-2 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- Navigation Buttons -->
        <div class="flex justify-between" in:animationDelay={500}>
          <a
            href="/knowledge-base"
            class="btn btn-outline inline-flex items-center"
          >
            <ArrowLeft size={18} class="mr-2" />
            Back to Knowledge Base
          </a>
        </div>
      {:else if mounted}
        <!-- Loading or article not found -->
        <div class="py-16 text-center">
          <h1 class="mb-4 text-2xl font-bold text-contrast-content">
            Article not found
          </h1>
          <p class="mb-6 text-contrast-content/70">
            The article you're looking for doesn't exist.
          </p>
          <a href="/knowledge-base" class="btn btn-secondary">
            Back to Knowledge Base
          </a>
        </div>
      {/if}
    </div>
  </div>
</main>
