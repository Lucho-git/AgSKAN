<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleX,
    FileImage,
    Heart,
    Laugh,
    Mail,
    MapPin,
    MessageSquare,
    Play,
    Quote,
    Star,
    ThumbsUp,
    Twitter,
    Users,
    Video,
  } from "lucide-svelte"
  import { onMount } from "svelte"

  let mounted = false
  let showFilters = false
  let currentPage = 1
  const testimonialsPerPage = 15

  type TestimonialType =
    | "text"
    | "tweet"
    | "image"
    | "email"
    | "video"
    | "facebook"

  interface Testimonial {
    name: string
    position: string
    location: string
    quote: string
    rating: number
    image: string
    featured?: boolean
    type: TestimonialType
    media?: string
    date?: string
    platform?: string
    reactions?: {
      likes: number
      loves: number
      laughs: number
      comments?: number
      shares?: number
    }
    comments?: Array<{
      author: string
      text: string
      image: string
    }>
  }

  let filter: number | null = null
  let typeFilter: TestimonialType | "all" = "all"

  const testimonials: Testimonial[] = [
    // Original text testimonials
    {
      name: "Tom Miller",
      position: "Broadacre Farmer, WA",
      location: "Perth, Western Australia",
      quote:
        "We saved hours every day once the whole crew was on AgSKAN. I just look at the map and know exactly what's going on.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/32.jpg",
      type: "text",
    },
    {
      name: "Karen Doyle",
      position: "Mixed Crop, VIC",
      location: "Bendigo, Victoria",
      quote:
        "Before AgSKAN, we were guessing. Now the boys know exactly where to go next. No overlap. No phone tag. Just smooth.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/women/23.jpg",
      type: "text",
    },
    {
      name: "Blake Jensen",
      position: "3,500ha Operation, NSW",
      location: "Dubbo, New South Wales",
      quote:
        "We trialled the free version during spraying and upgraded before harvest. Worth every cent -- the fuel savings alone made it back.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/45.jpg",
      type: "text",
    },
    // Tweets
    {
      name: "Alex Farmer",
      position: "Wheat Grower",
      location: "Adelaide, South Australia",
      quote:
        "Just started using @AgSKAN and already seeing fuel savings. No more driving over the same ground twice! #AgTech #Farming",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/67.jpg",
      type: "tweet",
      date: "May 10, 2025",
      platform: "Twitter",
    },
    {
      name: "Sarah Williams",
      position: "Agricultural Consultant",
      location: "Melbourne, Victoria",
      quote:
        "My clients who've switched to @AgSKAN are reporting 15-20% reduction in operating costs. Real-time farm tracking that actually works! #FarmTech",
      rating: 5,
      image: "https://randomuser.me/api/portraits/women/41.jpg",
      type: "tweet",
      date: "Apr 28, 2025",
      platform: "Twitter",
    },
    // Email screenshots
    {
      name: "John Barley",
      position: "Farm Manager",
      location: "Geraldton, Western Australia",
      quote:
        "I just wanted to thank you for the excellent support. Your team helped us map our entire operation in under an hour, and we're already seeing the benefits.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/22.jpg",
      type: "email",
      media:
        "https://images.unsplash.com/photo-1554224155-3a58922a22c3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80",
      date: "May 5, 2025",
    },
    // Image testimonials
    {
      name: "Robert Davidson",
      position: "Cattle & Crop, NT",
      location: "Katherine, Northern Territory",
      quote:
        "The app running on our devices during harvest. Game changer for coordination.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/22.jpg",
      type: "image",
      media:
        "https://images.unsplash.com/photo-1591825729269-caeb344f6df2?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1080&q=80",
    },
    {
      name: "Jennifer Cooper",
      position: "Contract Harvester",
      location: "Esperance, Western Australia",
      quote:
        "Our whole team using AgSKAN during the busy season. No more confusion about where to go next!",
      rating: 5,
      image: "https://randomuser.me/api/portraits/women/29.jpg",
      type: "image",
      media:
        "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80",
    },
    // Video testimonial
    {
      name: "Michael Zhang",
      position: "Horticultural Producer",
      location: "Shepparton, Victoria",
      quote:
        "We use AgSKAN to coordinate our picking crews across multiple orchards. The time savings are substantial.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/52.jpg",
      type: "video",
      media:
        "https://storage.googleapis.com/agskan-media/testimonials/zhang-orchard-tour.mp4",
    },
    // Facebook posts
    {
      name: "Laura Martinez",
      position: "Organic Farmer",
      location: "Margaret River, WA",
      quote:
        "Just finished our first season using AgSKAN and I have to say it has completely transformed how we coordinate our team. No more confusion about which paddocks have been covered, who's where, or what needs to be done next. Highly recommend to any operation with multiple vehicles or crew members!",
      rating: 5,
      image: "https://randomuser.me/api/portraits/women/32.jpg",
      type: "facebook",
      date: "April 30, 2025",
      reactions: {
        likes: 48,
        loves: 21,
        laughs: 3,
        comments: 7,
        shares: 12,
      },
      comments: [
        {
          author: "Mark Johnson",
          text: "We just started using it too. Game changer!",
          image: "https://randomuser.me/api/portraits/men/78.jpg",
        },
        {
          author: "Emma Watson",
          text: "How's the offline mode working in areas with poor reception?",
          image: "https://randomuser.me/api/portraits/women/56.jpg",
        },
      ],
    },
    {
      name: "Jason Chen",
      position: "Agribusiness Owner",
      location: "Toowoomba, QLD",
      quote:
        "I was skeptical about adding yet another app to our operation, but AgSKAN actually reduced our tech burden by replacing multiple systems. The real-time tracking has eliminated all the radio back-and-forth asking where everyone is. Highly recommended if you run multiple machines.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/56.jpg",
      type: "facebook",
      date: "May 12, 2025",
      reactions: {
        likes: 103,
        loves: 34,
        laughs: 0,
        comments: 16,
        shares: 24,
      },
      comments: [
        {
          author: "Teresa Wong",
          text: "How much data does it use per day?",
          image: "https://randomuser.me/api/portraits/women/38.jpg",
        },
        {
          author: "John Smith",
          text: "Worth every penny for larger operations!",
          image: "https://randomuser.me/api/portraits/men/22.jpg",
        },
      ],
    },
    // More text testimonials
    {
      name: "Emma Sutherland",
      position: "Farm Manager, TAS",
      location: "Launceston, Tasmania",
      quote:
        "The customer support is exceptional. They helped us map our entire operation in under an hour.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/women/65.jpg",
      type: "text",
    },
    {
      name: "James Wilson",
      position: "5,000ha operation, WA",
      location: "Geraldton, Western Australia",
      quote:
        "I was skeptical about another farm app, but AgSKAN literally paid for itself in the first week. The whole team knows where everyone is, and we're not driving over the same ground twice.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/42.jpg",
      type: "text",
    },
    {
      name: "Samantha Green",
      position: "Vineyard Manager",
      location: "Barossa Valley, SA",
      quote:
        "AgSKAN has transformed how we manage our vineyard operations. The ability to see exactly where each team is working has eliminated wasted time and duplication of effort.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/women/33.jpg",
      type: "text",
    },
    // Page 2 testimonials
    {
      name: "David Peterson",
      position: "Grain Grower",
      location: "Wagga Wagga, NSW",
      quote:
        "After just one season, I can't imagine going back to our old system. The fuel savings alone covered the subscription cost. Plus my team is happier - no more confusion or wasted trips.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/men/33.jpg",
      type: "text",
    },
    {
      name: "Isabella Thompson",
      position: "Horticultural Manager",
      location: "Mildura, VIC",
      quote:
        "We implemented AgSKAN during our busiest harvest season, and it was surprisingly easy to get everyone on board. The app is intuitive enough that even our least tech-savvy workers picked it up quickly.",
      rating: 5,
      image: "https://randomuser.me/api/portraits/women/42.jpg",
      type: "text",
    },
  ]

  onMount(() => {
    mounted = true
    window.scrollTo(0, 0)
  })

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

  $: filteredTestimonials = testimonials
    .filter((t) => (filter ? t.rating === filter : true))
    .filter((t) => (typeFilter !== "all" ? t.type === typeFilter : true))

  // Calculate pagination
  $: totalPages = Math.ceil(filteredTestimonials.length / testimonialsPerPage)

  // Get current page testimonials
  $: indexOfLastTestimonial = currentPage * testimonialsPerPage
  $: indexOfFirstTestimonial = indexOfLastTestimonial - testimonialsPerPage
  $: currentTestimonials = filteredTestimonials.slice(
    indexOfFirstTestimonial,
    indexOfLastTestimonial,
  )

  // Handle page navigation
  function paginate(pageNumber: number) {
    currentPage = pageNumber
    window.scrollTo(0, 0)
  }

  function nextPage() {
    currentPage = Math.min(currentPage + 1, totalPages)
    window.scrollTo(0, 0)
  }

  function prevPage() {
    currentPage = Math.max(currentPage - 1, 1)
    window.scrollTo(0, 0)
  }

  function handleFilterChange(newTypeFilter: TestimonialType | "all") {
    typeFilter = newTypeFilter
    showFilters = false
    currentPage = 1
  }

  function resetFilters() {
    filter = null
    typeFilter = "all"
    currentPage = 1
  }

  const typeFilterOptions = [
    { value: "all", label: "All Types", icon: Users },
    { value: "text", label: "Text Reviews", icon: Quote },
    { value: "tweet", label: "Tweets", icon: Twitter },
    { value: "facebook", label: "Facebook Posts", icon: ThumbsUp },
    { value: "image", label: "Images", icon: FileImage },
    { value: "email", label: "Emails", icon: Mail },
    { value: "video", label: "Videos", icon: Video },
  ]
</script>

<svelte:head>
  <title>Wall of Love - AgSKAN</title>
  <meta
    name="description"
    content="Hear directly from farmers who've transformed their operations with AgSKAN. Real stories from real people making real progress in the field."
  />
</svelte:head>

<main class="overflow-x-hidden bg-base-100 text-contrast-content">
  <section class="bg-base-100 pb-16 pt-32">
    <div class="section-container">
      {#if mounted}
        <div
          class="mx-auto mb-12 max-w-3xl text-center"
          in:animationDelay={100}
        >
          <div class="mb-4 inline-flex items-center justify-center">
            <div class="h-1 w-12 rounded-full bg-base-content"></div>
            <span class="mx-3 font-medium text-base-content">Testimonials</span>
            <div class="h-1 w-12 rounded-full bg-base-content"></div>
          </div>
          <h1
            class="mb-5 font-sans text-4xl font-bold text-contrast-content md:text-5xl"
          >
            Our Wall of Love
          </h1>
          <p class="mx-auto max-w-2xl text-lg text-contrast-content/80">
            Hear directly from farmers who've transformed their operations with
            AgSKAN. Real stories from real people making real progress in the
            field.
          </p>
          <a
            href="/"
            class="group mt-5 inline-flex items-center text-base-content transition-all hover:underline"
          >
            <ArrowLeft
              size={16}
              class="mr-2 transition-transform group-hover:-translate-x-1"
            />
            Back to Home
          </a>
        </div>

        <div
          class="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
          <div class="inline-flex rounded-lg bg-base-200 p-1 shadow-sm">
            <button
              on:click={() => {
                filter = null
                currentPage = 1
              }}
              class={`rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                filter === null
                  ? "bg-secondary text-secondary-content shadow-md"
                  : "text-contrast-content/70 hover:bg-base-300"
              }`}
            >
              All Reviews
            </button>
            <button
              on:click={() => {
                filter = 5
                currentPage = 1
              }}
              class={`rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                filter === 5
                  ? "bg-secondary text-secondary-content shadow-md"
                  : "text-contrast-content/70 hover:bg-base-300"
              }`}
            >
              <div class="flex items-center">
                <span>5</span>
                <Star size={14} class="ml-1 fill-current text-yellow-400" />
                <span class="ml-1">Only</span>
              </div>
            </button>
            <button
              on:click={() => {
                filter = 4
                currentPage = 1
              }}
              class={`rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                filter === 4
                  ? "bg-secondary text-secondary-content shadow-md"
                  : "text-contrast-content/70 hover:bg-base-300"
              }`}
            >
              <div class="flex items-center">
                <span>4</span>
                <Star size={14} class="ml-1 fill-current text-yellow-400" />
                <span class="ml-1">Only</span>
              </div>
            </button>
          </div>

          <div class="relative">
            <button
              class="flex items-center gap-2 rounded-lg bg-base-200 px-5 py-2.5 text-sm font-medium text-contrast-content/80 shadow-sm transition-all hover:shadow"
              on:click={() => (showFilters = !showFilters)}
            >
              {typeFilter === "all"
                ? "All Types"
                : typeFilter === "text"
                  ? "Text Reviews"
                  : typeFilter === "tweet"
                    ? "Tweets"
                    : typeFilter === "facebook"
                      ? "Facebook Posts"
                      : typeFilter === "image"
                        ? "Images"
                        : typeFilter === "email"
                          ? "Emails"
                          : typeFilter === "video"
                            ? "Videos"
                            : "Filter by Type"}
              <ChevronDown
                size={16}
                class={`transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`}
              />
            </button>

            {#if showFilters}
              <div
                class="absolute right-0 z-10 mt-2 min-w-[220px] overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-lg"
              >
                <div class="p-1">
                  {#each typeFilterOptions as option}
                    <button
                      class={`flex w-full items-center gap-2 rounded-md px-4 py-2.5 text-left text-sm transition-all duration-200 ${
                        typeFilter === option.value
                          ? "bg-secondary/20 text-secondary"
                          : "hover:bg-base-200"
                      }`}
                      on:click={() => handleFilterChange(option.value)}
                    >
                      <svelte:component this={option.icon} size={16} />
                      {option.label}
                      {#if typeFilter === option.value}
                        <Check size={16} class="ml-auto" />
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>

        {#if currentTestimonials.length === 0}
          <div class="rounded-xl bg-base-200 py-16 text-center">
            <div
              class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-base-300"
            >
              <CircleX size={32} class="text-contrast-content/50" />
            </div>
            <h3 class="mb-3 text-xl font-bold text-contrast-content">
              No testimonials found
            </h3>
            <p class="mx-auto max-w-md text-contrast-content/70">
              Try adjusting your filters to see more testimonials from our happy
              customers.
            </p>
            <button
              on:click={resetFilters}
              class="mt-6 rounded-lg bg-secondary/20 px-5 py-2 font-medium text-secondary transition-colors hover:bg-secondary/30"
            >
              Reset Filters
            </button>
          </div>
        {:else}
          <!-- Replace the existing grid section with this: -->
          <div class="mb-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {#each currentTestimonials as testimonial, index}
              <!-- Facebook style post -->
              {#if testimonial.type === "facebook"}
                <div
                  class="flex h-full flex-col rounded-xl border border-base-300 bg-base-200 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  in:animationDelay={index * 50}
                >
                  <!-- FB Header -->
                  <div
                    class="mb-3 flex items-center gap-3 border-b border-base-300 pb-3"
                  >
                    <div
                      class="h-11 w-11 overflow-hidden rounded-full border border-base-300 shadow-sm"
                    >
                      <img
                        src={testimonial.image}
                        alt={testimonial.name}
                        class="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <h4 class="font-semibold text-contrast-content">
                        {testimonial.name}
                      </h4>
                      <div
                        class="flex items-center gap-2 text-xs text-contrast-content/60"
                      >
                        <time>{testimonial.date}</time>
                      </div>
                    </div>
                  </div>

                  <!-- FB Post Content -->
                  <div class="mb-3 flex-grow">
                    <p class="text-sm leading-relaxed text-contrast-content/80">
                      {testimonial.quote}
                    </p>
                  </div>

                  <!-- Author divider -->
                  <div class="mb-3 border-t border-base-300"></div>

                  <!-- FB Reactions - Simplified -->
                  <div
                    class="mt-auto flex items-center text-xs text-contrast-content/60"
                  >
                    <div class="mr-3 flex items-center gap-1">
                      <div class="flex -space-x-1">
                        <div
                          class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 shadow-sm"
                        >
                          <ThumbsUp size={10} class="text-white" />
                        </div>
                        <div
                          class="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 shadow-sm"
                        >
                          <Heart size={10} class="text-white" />
                        </div>
                      </div>
                      <span
                        >{(testimonial.reactions?.likes || 0) +
                          (testimonial.reactions?.loves || 0) +
                          (testimonial.reactions?.laughs || 0)}</span
                      >
                    </div>
                    <span class="mr-2"
                      >{testimonial.reactions?.comments} comments</span
                    >
                    <span>{testimonial.reactions?.shares} shares</span>
                  </div>
                </div>
              {:else if testimonial.type === "tweet"}
                <div
                  class="flex h-full flex-col rounded-xl border-2 border-blue-300/50 bg-base-200 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  in:animationDelay={index * 50}
                >
                  <div
                    class="mb-4 flex items-center gap-3 border-b border-base-300 pb-3"
                  >
                    <Twitter size={18} class="text-blue-500" />
                    <span class="font-medium text-blue-500"
                      >{testimonial.platform}</span
                    >
                    <span class="ml-auto text-sm text-contrast-content/60"
                      >{testimonial.date}</span
                    >
                  </div>

                  <p class="mb-4 flex-grow text-contrast-content/80">
                    {testimonial.quote}
                  </p>

                  <!-- Author divider -->
                  <div class="mb-4 border-t border-base-300"></div>

                  <div class="flex items-center gap-3">
                    <div
                      class="h-12 w-12 overflow-hidden rounded-full border-2 border-base-300 shadow-sm"
                    >
                      <img
                        src={testimonial.image}
                        alt={testimonial.name}
                        class="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <h4 class="font-semibold text-contrast-content">
                        {testimonial.name}
                      </h4>
                      <p class="text-sm text-contrast-content/60">
                        {testimonial.position}
                      </p>
                    </div>
                  </div>
                </div>
              {:else if testimonial.type === "image"}
                <div
                  class="flex h-full flex-col overflow-hidden rounded-xl border border-base-300 bg-base-200 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  in:animationDelay={index * 50}
                >
                  <div class="aspect-video w-full overflow-hidden bg-gray-900">
                    <img
                      src={testimonial.media}
                      alt={testimonial.quote}
                      class="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                  </div>

                  <div class="flex flex-grow flex-col p-5">
                    <p class="mb-4 flex-grow text-contrast-content/80">
                      {testimonial.quote}
                    </p>

                    <!-- Author divider -->
                    <div class="mb-3 border-t border-base-300"></div>

                    <div class="mt-auto flex items-center gap-3">
                      <div
                        class="h-10 w-10 overflow-hidden rounded-full border-2 border-base-300 shadow-sm"
                      >
                        <img
                          src={testimonial.image}
                          alt={testimonial.name}
                          class="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <h4 class="font-semibold text-contrast-content">
                          {testimonial.name}
                        </h4>
                        <p class="text-xs text-contrast-content/60">
                          {testimonial.position}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              {:else if testimonial.type === "email"}
                <div
                  class="flex h-full flex-col rounded-xl border border-base-300 bg-base-300 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  in:animationDelay={index * 50}
                >
                  <div
                    class="mb-4 flex items-center gap-2 border-b border-base-300 pb-3"
                  >
                    <Mail size={16} class="text-base-content" />
                    <span class="text-sm text-contrast-content/70">Email</span>
                    <time class="ml-auto text-xs text-contrast-content/60"
                      >{testimonial.date}</time
                    >
                  </div>

                  <div
                    class="mb-4 flex-grow rounded-lg border border-base-300 bg-base-100 p-4 text-sm"
                  >
                    <p class="leading-relaxed text-contrast-content/80">
                      {testimonial.quote}
                    </p>
                  </div>

                  <!-- Author divider -->
                  <div class="mb-3 border-t border-base-300"></div>

                  <div class="flex items-center gap-3">
                    <div
                      class="h-10 w-10 overflow-hidden rounded-full shadow-sm"
                    >
                      <img
                        src={testimonial.image}
                        alt={testimonial.name}
                        class="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <h4 class="font-medium text-contrast-content">
                        {testimonial.name}
                      </h4>
                      <p class="text-xs text-contrast-content/60">
                        {testimonial.position}
                      </p>
                    </div>
                  </div>
                </div>
              {:else if testimonial.type === "video"}
                <div
                  class="flex h-full flex-col overflow-hidden rounded-xl border border-base-300 bg-base-200 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  in:animationDelay={index * 50}
                >
                  <div
                    class="group relative flex aspect-video w-full items-center justify-center bg-gray-900"
                  >
                    <div
                      class="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1625246333195-78d9c38ad449?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80')] bg-cover bg-center opacity-60"
                    ></div>
                    <div
                      class="absolute inset-0 bg-black bg-opacity-30 transition-all duration-300 group-hover:bg-opacity-20"
                    ></div>
                    <button
                      class="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-base-content shadow-lg transition-colors transition-transform duration-300 hover:bg-base-content/90 group-hover:scale-110"
                    >
                      <Play size={28} class="ml-1 text-base-100" />
                    </button>
                  </div>

                  <div class="flex flex-grow flex-col p-5">
                    <p class="mb-4 flex-grow text-contrast-content/80">
                      {testimonial.quote}
                    </p>

                    <!-- Author divider -->
                    <div class="mb-3 border-t border-base-300"></div>

                    <div class="mt-auto flex items-center gap-3">
                      <div
                        class="h-10 w-10 overflow-hidden rounded-full shadow-sm"
                      >
                        <img
                          src={testimonial.image}
                          alt={testimonial.name}
                          class="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <h4 class="font-semibold text-contrast-content">
                          {testimonial.name}
                        </h4>
                        <p class="text-xs text-contrast-content/60">
                          {testimonial.position}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- Default text testimonial -->
                <div
                  class="relative flex h-full flex-col rounded-xl border border-base-300 bg-base-200 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  in:animationDelay={index * 50}
                >
                  <div
                    class="absolute -left-4 -top-4 flex h-8 w-8 items-center justify-center rounded-full bg-base-content text-base-100 shadow-md"
                  >
                    <Quote size={14} />
                  </div>

                  <div class="mb-4 mt-2 flex items-center gap-1">
                    {#each Array.from({ length: testimonial.rating }) as _, i}
                      <Star size={16} class="fill-current text-yellow-400" />
                    {/each}
                    {#each Array.from( { length: 5 - testimonial.rating }, ) as _, i}
                      <Star size={16} class="text-base-300" />
                    {/each}
                  </div>

                  <p class="mb-4 flex-grow text-contrast-content/80">
                    {testimonial.quote}
                  </p>

                  <!-- Author divider -->
                  <div class="mb-3 border-t border-base-300"></div>

                  <div class="flex items-center gap-3">
                    <div
                      class="h-12 w-12 overflow-hidden rounded-full border-2 border-base-300 shadow-sm"
                    >
                      <img
                        src={testimonial.image}
                        alt={testimonial.name}
                        class="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <h4 class="font-semibold text-contrast-content">
                        {testimonial.name}
                      </h4>
                      <p class="text-sm text-contrast-content/70">
                        {testimonial.position}
                      </p>
                      <div
                        class="mt-1 flex items-center text-xs text-contrast-content/60"
                      >
                        <MapPin size={10} class="mr-1" />
                        {testimonial.location}
                      </div>
                    </div>
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Pagination -->
        {#if filteredTestimonials.length > testimonialsPerPage}
          <div class="mb-16 mt-10 flex items-center justify-center">
            <nav
              class="inline-flex items-center rounded-lg border border-base-300 bg-base-200 p-1 shadow-sm"
              aria-label="Pagination"
            >
              <button
                on:click={prevPage}
                disabled={currentPage === 1}
                class={`flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 ${
                  currentPage === 1
                    ? "cursor-not-allowed text-contrast-content/40"
                    : "text-contrast-content hover:bg-base-300"
                }`}
              >
                <span class="sr-only">Previous Page</span>
                <ChevronLeft size={20} />
              </button>

              <!-- Page numbers -->
              {#each Array.from({ length: totalPages }) as _, index}
                {@const pageNumber = index + 1}
                {@const isCurrentPage = pageNumber === currentPage}

                {#if pageNumber === 1 || pageNumber === totalPages || (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)}
                  <button
                    on:click={() => paginate(pageNumber)}
                    class={`flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 ${
                      isCurrentPage
                        ? "bg-secondary text-secondary-content shadow-sm"
                        : "text-contrast-content hover:bg-base-300"
                    }`}
                  >
                    {pageNumber}
                  </button>
                {:else if (pageNumber === currentPage - 2 && pageNumber > 1) || (pageNumber === currentPage + 2 && pageNumber < totalPages)}
                  <span
                    class="flex h-10 w-10 items-center justify-center text-contrast-content/50"
                  >
                    ...
                  </span>
                {/if}
              {/each}

              <button
                on:click={nextPage}
                disabled={currentPage === totalPages}
                class={`flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200 ${
                  currentPage === totalPages
                    ? "cursor-not-allowed text-contrast-content/40"
                    : "text-contrast-content hover:bg-base-300"
                }`}
              >
                <span class="sr-only">Next Page</span>
                <ChevronRight size={20} />
              </button>
            </nav>
          </div>
        {/if}

        <div
          class="mx-auto max-w-xl rounded-2xl border border-secondary/20 bg-gradient-to-r from-secondary/50 to-primary/50 p-8 text-center shadow-sm"
        >
          <div
            class="mb-4 inline-flex items-center justify-center rounded-full bg-base-200 p-2 shadow-sm"
          >
            <MessageSquare size={24} class="text-base-content" />
          </div>
          <h3 class="mb-4 font-sans text-2xl font-bold text-contrast-content">
            Share Your Success Story
          </h3>
          <p class="mb-6 text-contrast-content/80">
            Are you using AgSKAN? We'd love to hear about your experience and
            share it with the farming community.
          </p>
          <a
            href="mailto:stories@skanfarming.com.au"
            class="btn btn-secondary inline-flex items-center px-6 py-3 text-base shadow transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
          >
            Submit Your Story
            <MessageSquare size={16} class="ml-2" />
          </a>
        </div>
      {/if}
    </div>
  </section>
</main>
