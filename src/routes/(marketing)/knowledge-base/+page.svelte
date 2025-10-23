<script lang="ts">
  import { onMount } from "svelte"
  import {
    Play,
    BookOpen,
    ChevronDown,
    Clock,
    Phone,
    Mail,
  } from "lucide-svelte"
  import { getArticlesByCategory } from "$lib/data/articleData"

  let mounted = false
  let activeVideoId = null

  onMount(() => {
    mounted = true
  })

  // Video content organized by topic
  const videoContent = {
    "Getting Started": [
      {
        id: "setup-4min",
        title: "Setup AgSKAN in 4 Minutes",
        description: "Quick overview to get you up and running",
        videoId: "FEoL4K-GXWs",
        duration: "4:00",
      },
      {
        id: "create-map",
        title: "Creating Your First Farm Map",
        description: "Step-by-step map creation guide",
        videoId: "SnbBcs5dbCI",
        duration: "3:45",
      },
      {
        id: "invite-operators",
        title: "Inviting Team Members",
        description: "Share your map with operators",
        videoId: "Ro-2SxeCbvk",
        duration: "2:30",
      },
      {
        id: "setup-machine",
        title: "Setting Up a Machine",
        description: "Configure tablets and phones for tracking",
        videoId: "5tFlijiWSFI",
        duration: "5:15",
      },
    ],
    "Farm Setup": [
      {
        id: "upload-boundaries",
        title: "Uploading Paddock Boundaries",
        description: "Import your farm layout",
        videoId: "f-A0YgnNQPw",
        duration: "4:20",
      },
      {
        id: "create-operation",
        title: "Creating Operations",
        description: "Set up tasks for your team",
        videoId: "Mg3_RQhHLkM",
        duration: "3:50",
      },
      {
        id: "multi-user",
        title: "Multi-User Farm Setup",
        description: "Complete setup for teams",
        videoId: "wG7YEapbJP0",
        duration: "12:30",
      },
    ],
    Configuration: [
      {
        id: "hardware",
        title: "Hardware Recommendations",
        description: "Choosing the right devices",
        videoId: "GqGZwjTEUis",
        duration: "6:10",
      },
      {
        id: "billing",
        title: "Managing Billing & Seats",
        description: "Understand subscription management",
        videoId: "ynZOc92JKuU",
        duration: "4:45",
      },
      {
        id: "location-settings",
        title: "Location Settings",
        description: "Configure GPS and tracking",
        videoId: "jfjvD6zd3m8",
        duration: "3:20",
      },
    ],
    "Core Features": [
      {
        id: "trailing",
        title: "GPS Tracking & Trailing",
        description: "Start and stop location tracking",
        videoId: "2nxlB5xfZbY",
        duration: "3:15",
      },
      {
        id: "pin-drop",
        title: "Using Pin Drops",
        description: "Mark locations on your map",
        videoId: "1JMk4Dkx_-M",
        duration: "2:45",
      },
      {
        id: "locate-operator",
        title: "Finding Team Members",
        description: "Locate operators in real-time",
        videoId: "j4DaexMeAUk",
        duration: "2:20",
      },
    ],
    "Map Tools": [
      {
        id: "edit-paddock",
        title: "Editing Paddock Details",
        description: "Modify farm information",
        videoId: "OLjme1M9eQg",
        duration: "3:30",
      },
      {
        id: "mapping-layers",
        title: "Changing Map Layers",
        description: "Switch between different views",
        videoId: "S-NZmq4qMk4",
        duration: "2:50",
      },
      {
        id: "measure-tool",
        title: "Measuring Distances & Areas",
        description: "Use the measurement tool",
        videoId: "Dey7dPHBbPQ",
        duration: "3:10",
      },
      {
        id: "map-drawing",
        title: "Drawing on Maps",
        description: "Create custom shapes and notes",
        videoId: "-CjaCE09suQ",
        duration: "4:05",
      },
      {
        id: "colour-coding",
        title: "Color Coding Paddocks",
        description: "Organize with colors",
        videoId: "JjN-46lRcrY",
        duration: "2:40",
      },
    ],
    "Advanced Features": [
      {
        id: "path-recreate",
        title: "Path History & Replay",
        description: "Review past movements",
        videoId: "DqeYIKsrWzs",
        duration: "4:30",
      },
      {
        id: "vehicle-presets",
        title: "Vehicle Presets",
        description: "Save machinery configurations",
        videoId: "92trel3xiFI",
        duration: "3:25",
      },
      {
        id: "background-location",
        title: "Background GPS Tracking",
        description: "Tracking when app is minimized",
        videoId: "rdz0ll5gb-g",
        duration: "3:00",
      },
    ],
  }

  // Article categories
  const articleCategories = [
    {
      title: "Getting Started",
      slug: "getting-started",
      articles: getArticlesByCategory("Getting Started"),
    },
    {
      title: "Troubleshooting",
      slug: "troubleshooting",
      articles: getArticlesByCategory("Troubleshooting"),
    },
    {
      title: "FAQs",
      slug: "faqs",
      articles: getArticlesByCategory("FAQs"),
    },
  ]

  function toggleVideo(videoId) {
    activeVideoId = activeVideoId === videoId ? null : videoId
  }
</script>

<svelte:head>
  <title>Help Center - AgSKAN</title>
</svelte:head>

<div class="min-h-screen bg-base-200">
  <!-- Header -->
  <div class="border-b border-base-300 bg-base-100">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 class="mb-4 text-center text-5xl font-bold text-base-content">
        Help Center
      </h1>
      <p class="mx-auto max-w-2xl text-center text-xl text-base-content/70">
        Video tutorials and articles to help you get the most out of AgSKAN
      </p>
    </div>
  </div>

  <div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <!-- Video Tutorials Section -->
    <div class="mb-16">
      <div class="mb-8 flex items-center gap-3">
        <div class="rounded-lg bg-base-content/10 p-3">
          <Play class="text-base-content" size={28} />
        </div>
        <h2 class="text-3xl font-bold text-base-content">Video Tutorials</h2>
      </div>

      <div class="space-y-12">
        {#each Object.entries(videoContent) as [category, videos]}
          <div>
            <!-- Category Title -->
            <h3
              class="mb-6 flex items-center gap-3 text-2xl font-semibold text-base-content"
            >
              <span class="h-8 w-1 rounded-full bg-base-content/20"></span>
              {category}
            </h3>

            <!-- Video Grid with Thumbnails -->
            <div
              class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {#each videos as video}
                <div class="group">
                  <button
                    on:click={() => toggleVideo(video.id)}
                    class="w-full text-left"
                  >
                    <!-- Thumbnail Container -->
                    <div
                      class="relative mb-3 aspect-video overflow-hidden rounded-lg border border-base-300 bg-base-300 transition-all group-hover:border-base-content/30"
                    >
                      <!-- YouTube Thumbnail -->
                      <img
                        src={`https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`}
                        alt={video.title}
                        class="h-full w-full object-cover"
                      />

                      <!-- Play Button Overlay -->
                      <div
                        class="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/50"
                      >
                        <div
                          class="rounded-full bg-base-content/90 p-4 transition-transform group-hover:scale-110"
                        >
                          <Play
                            class="text-base-100"
                            size={24}
                            fill="currentColor"
                          />
                        </div>
                      </div>

                      <!-- Duration Badge -->
                      <div
                        class="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/80 px-2 py-1 text-xs font-medium text-white"
                      >
                        <Clock size={12} />
                        {video.duration}
                      </div>
                    </div>

                    <!-- Video Info -->
                    <h4
                      class="mb-1 line-clamp-2 font-semibold text-base-content transition-colors group-hover:text-base-content/70"
                    >
                      {video.title}
                    </h4>
                    <p class="line-clamp-2 text-sm text-base-content/60">
                      {video.description}
                    </p>
                  </button>

                  <!-- Expanded Video Player -->
                  {#if activeVideoId === video.id}
                    <div
                      class="mt-4 overflow-hidden rounded-lg border border-base-300 shadow-lg"
                    >
                      <div class="aspect-video bg-black">
                        <iframe
                          class="h-full w-full"
                          src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1`}
                          title={video.title}
                          frameborder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowfullscreen
                        ></iframe>
                      </div>
                      <div class="bg-base-100 p-4">
                        <h5 class="mb-1 font-semibold text-base-content">
                          {video.title}
                        </h5>
                        <p class="text-sm text-base-content/70">
                          {video.description}
                        </p>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Help Articles Section -->
    <div>
      <div class="mb-8 flex items-center gap-3">
        <div class="rounded-lg bg-base-content/10 p-3">
          <BookOpen class="text-base-content" size={28} />
        </div>
        <h2 class="text-3xl font-bold text-base-content">Help Articles</h2>
      </div>

      <div class="grid gap-6 md:grid-cols-3">
        {#each articleCategories as category}
          <div
            class="rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm transition-shadow hover:shadow-lg"
          >
            <div
              class="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-lg bg-base-content/10"
            >
              <BookOpen class="text-base-content" size={28} />
            </div>

            <h3 class="mb-6 text-2xl font-semibold text-base-content">
              {category.title}
            </h3>

            <ul class="mb-6 space-y-3">
              {#each category.articles.slice(0, 5) as article}
                <li>
                  <a
                    href={`/knowledge-base/article/${article.slug}`}
                    class="block py-1 text-base-content/80 hover:text-base-content hover:underline"
                  >
                    {article.title}
                  </a>
                </li>
              {/each}
            </ul>

            <a
              href={`/knowledge-base/category/${category.slug}`}
              class="inline-flex items-center font-medium text-base-content transition-colors hover:text-base-content/70"
            >
              View all articles
              <ChevronDown class="ml-1 rotate-[-90deg]" size={18} />
            </a>
          </div>
        {/each}
      </div>
    </div>

    <!-- Contact Section -->
    <div
      class="mt-16 rounded-2xl border border-base-300 bg-base-100 p-10 text-center shadow-sm"
    >
      <h2 class="mb-3 text-3xl font-bold text-base-content">
        Still need help?
      </h2>
      <p class="mx-auto mb-8 max-w-xl text-lg text-base-content/70">
        Our support team is here to help you get the most out of AgSKAN
      </p>
      <div class="flex flex-col justify-center gap-4 sm:flex-row">
        <a
          href="tel:0439405248"
          class="inline-flex items-center justify-center gap-2 rounded-lg bg-base-content px-8 py-4 font-semibold text-base-100 transition-opacity hover:opacity-90"
        >
          <Phone size={20} />
          0439 405 248
        </a>
        <a
          href="mailto:ryan@skanfarming.com"
          class="inline-flex items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200 px-8 py-4 font-semibold text-base-content transition-colors hover:bg-base-300"
        >
          <Mail size={20} />
          Email Support
        </a>
      </div>
    </div>
  </div>
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
