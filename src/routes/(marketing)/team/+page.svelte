<script lang="ts">
  import {
    ArrowRight,
    Award,
    Book,
    Calendar,
    Heart,
    Rocket,
  } from "lucide-svelte"
  import { onMount } from "svelte"

  let mounted = false

  onMount(() => {
    mounted = true
    // Scroll to top when component mounts
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

  const values = [
    {
      icon: Heart,
      title: "Farming First",
      description:
        "Everything we build starts with real farm problems, not technology solutions searching for problems.",
    },
    {
      icon: Award,
      title: "Radical Simplicity",
      description:
        "If it can't be learned in 5 minutes in the cab of a tractor, it's too complicated.",
    },
    {
      icon: Rocket,
      title: "Tangible Value",
      description:
        "Our solutions must pay for themselves in saved time, reduced overlap, or avoided mistakes.",
    },
  ]

  const teamMembers = [
    {
      name: "Ryan Skamp",
      role: "CEO & Co-Founder",
      bio: "Ryan has over 5000+ hours of machinery operating experience after spending 5+ years working in the Agricultural industry. He is applying these industry insights to build a program that will make farmers' lives easier.",
      image: "/images/ryan.jpg",
    },
    {
      name: "Lachie Ross",
      role: "CTO & Co-Founder",
      bio: "Lachie is a software engineer with a degree in Computer Science from Curtin University. He has been involved in many startups and innovations, bringing a wealth of technical knowledge to AgSKAN.",
      image: "/images/lachjacked.png",
    },
    {
      name: "Ella Ross",
      role: "Community Engagement Manager",
      bio: "Ella brings infectious enthusiasm and a genuine passion for connecting with farming communities across Australia. With her natural ability to bring people together, she's the heart of AgSKAN's outreach efforts.",
      image: "/images/Ella2.jpeg",
    },
    {
      name: "Filip Rippel",
      role: "Design & Marketing Specialist",
      bio: "Filip brings a disturbingly prejudiced perspective and questionable marketing tactics to AgSKAN's brand. With a narrow-minded eye for design and divisive, offensive copy, he somehow still manages to push our message onto farming communities across Australia, whether they like it or not.",
      image: "/images/filipmassive.png",
      hasQuestionMark: true,
    },
  ]

  const milestones = [
    {
      year: "2023",
      title: "AgSKAN Founded",
      description:
        "Two mates with 20+ years of friendship decided to solve coordination headaches plaguing Australian farms.",
    },
    {
      year: "2024",
      title: "First Prototype",
      description:
        "Initial concept developed and tested on local farms in regional Western Australia with promising results.",
    },
    {
      year: "2024",
      title: "Market Launch",
      description:
        "Launched AgSKAN to the Australian market, focusing on simple, mobile-first farm coordination.",
    },
    {
      year: "2025",
      title: "Growing Impact",
      description:
        "Expanding our reach to help more farms improve efficiency and reduce operational waste.",
    },
  ]
</script>

<svelte:head>
  <title>About Us - AgSKAN</title>
  <meta
    name="description"
    content="Learn about AgSKAN's mission to make farming more profitable by eliminating coordination headaches and operational waste."
  />
</svelte:head>

<main class="overflow-x-hidden bg-base-100 text-contrast-content">
  <!-- Hero Section -->
  <section
    class="relative overflow-hidden bg-gradient-to-b from-base-100 to-base-200 pb-12 pt-24 md:pb-20 md:pt-32"
  >
    <div
      class="absolute right-0 top-0 -mr-48 -mt-48 h-96 w-96 rounded-full bg-secondary/5 blur-3xl"
    ></div>
    <div
      class="absolute bottom-0 left-0 -mb-48 -ml-48 h-96 w-96 rounded-full bg-secondary/5 blur-3xl"
    ></div>

    <div class="section-container relative z-10">
      {#if mounted}
        <div class="mx-auto max-w-3xl text-center" in:animationDelay={0}>
          <h1
            class="mb-4 font-sans text-4xl font-bold text-contrast-content md:mb-6 md:text-5xl"
          >
            About <span class="text-base-content">AgSKAN</span>
          </h1>
          <p class="mb-6 text-lg text-contrast-content/80 md:mb-8 md:text-xl">
            A team of farmers and engineers with one mission: make farm
            logistics simple, visual, and accessible to every operation.
          </p>
          <div class="mt-8 flex justify-center gap-4">
            <a
              href="#company-story"
              class="btn btn-secondary px-6 py-3 text-base"
            >
              Our Story
              <ArrowRight size={16} class="ml-2" />
            </a>
            <a href="#team" class="btn btn-outline px-6 py-3 text-base">
              Meet The Team
            </a>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Company Story Section -->
  <section class="bg-base-100 py-12 md:py-20" id="company-story">
    <div class="section-container">
      {#if mounted}
        <div
          class="flex flex-col items-center gap-8 md:flex-row md:gap-12"
          in:animationDelay={100}
        >
          <div class="md:w-1/2">
            <div class="relative">
              <div class="overflow-hidden rounded-2xl bg-base-200 shadow-xl">
                <img
                  src="/images/team.jpg"
                  alt="AgSKAN founders in the field"
                  class="aspect-[4/3] h-auto w-full object-cover"
                />
              </div>
              <div
                class="absolute -bottom-6 -right-6 rounded-lg border border-base-300 bg-base-100 p-4 shadow-lg"
              >
                <div
                  class="flex items-center gap-2 font-bold text-base-content"
                >
                  <Book size={20} />
                  <span>Est. 2023</span>
                </div>
              </div>
            </div>
          </div>

          <div class="md:w-1/2">
            <h2
              class="mb-4 font-sans text-2xl font-bold text-contrast-content md:mb-6 md:text-3xl"
            >
              Our Story
            </h2>
            <div class="space-y-4 text-contrast-content/80">
              <p>
                Ryan and Lachie grew up together and have been mates for over 20
                years. After Ryan spent 5+ years working in agriculture with
                over 5000+ hours of machinery operating experience, he lived and
                breathed the coordination headaches plaguing modern farms.
              </p>
              <p>
                The constant radio chatter, missed messages, and equipment
                overlap wasn't just frustrating--it was costing farms serious
                time and money. With Ryan's deep agricultural insights and
                Lachie's software engineering expertise, they set out to build
                something that actually worked in the field.
              </p>
              <p class="font-medium text-contrast-content">
                AgSKAN was born simple, mobile-first, and built for the
                realities of rural internet. No expensive hardware. No
                complicated setup. Just clear visibility for everyone on the
                farm.
              </p>
              <p>
                Innovation and teamwork are at the heart of AgSKAN. We bring
                together life experience and technical skills to solve an
                immense problem in the agricultural industry.
              </p>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Mission and Values Section -->
  <section class="bg-base-200 py-12 md:py-20">
    <div class="section-container">
      {#if mounted}
        <div
          class="mx-auto mb-10 max-w-3xl text-center md:mb-16"
          in:animationDelay={200}
        >
          <h2
            class="mb-4 font-sans text-2xl font-bold text-contrast-content md:mb-6 md:text-3xl"
          >
            Our Mission
          </h2>
          <p class="text-xl text-contrast-content/80">
            To reduce input costs for farmers by eliminating coordination
            headaches and operational waste, making a genuine real world impact
            on modern day agriculture.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {#each values as value, index}
            <div
              class="h-full rounded-xl bg-base-100 p-6 shadow-md"
              in:animationDelay={300 + index * 100}
            >
              <div
                class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-content"
              >
                <svelte:component this={value.icon} size={22} />
              </div>
              <h3
                class="mb-3 font-sans text-xl font-bold text-contrast-content"
              >
                {value.title}
              </h3>
              <p class="text-contrast-content/80">{value.description}</p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <!-- Team Members Section -->
  <section class="bg-base-100 py-12 md:py-20" id="team">
    <div class="section-container">
      {#if mounted}
        <h2
          class="mb-8 text-center font-sans text-2xl font-bold text-contrast-content md:mb-12 md:text-3xl"
          in:animationDelay={400}
        >
          Our Leadership Team
        </h2>

        <div
          class="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4"
        >
          {#each teamMembers as person, index}
            <div
              class="overflow-hidden rounded-xl bg-base-200 shadow-md"
              in:animationDelay={500 + index * 100}
            >
              <div class="relative aspect-square overflow-hidden">
                <img
                  src={person.image}
                  alt={person.name}
                  class="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                />
                {#if person.hasQuestionMark}
                  <div
                    class="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-base-content/90 text-lg font-bold text-base-100 shadow-lg"
                  >
                    ?
                  </div>
                {/if}
              </div>
              <div class="p-6">
                <h3
                  class="mb-1 font-sans text-xl font-bold text-contrast-content"
                >
                  {person.name}
                </h3>
                <p class="mb-3 font-medium text-base-content">{person.role}</p>
                <p class="text-contrast-content/80">{person.bio}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <!-- Vision Section -->
  <section class="bg-base-200 py-12 md:py-20">
    <div class="section-container">
      {#if mounted}
        <div class="mx-auto max-w-4xl" in:animationDelay={600}>
          <h2
            class="mb-8 text-center font-sans text-2xl font-bold text-contrast-content md:text-3xl"
          >
            Our Vision
          </h2>
          <div class="rounded-xl bg-base-100 p-8 text-center shadow-md">
            <p class="text-xl leading-relaxed text-contrast-content/80">
              To reduce input costs for farmers. We want to reduce machine hours
              and carbon emissions to make a genuine real world impact on modern
              day agriculture, one paddock at a time. <span
                class="font-semibold text-contrast-content"
                >SKAN the horizon.</span
              >
            </p>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Timeline Section -->
  <section class="bg-base-100 py-12 md:py-20">
    <div class="section-container">
      {#if mounted}
        <h2
          class="mb-10 text-center font-sans text-2xl font-bold text-contrast-content md:mb-16 md:text-3xl"
          in:animationDelay={700}
        >
          Our Journey
        </h2>

        <div class="relative mx-auto max-w-3xl">
          <!-- Vertical line for timeline -->
          <div
            class="absolute bottom-0 left-[28px] top-0 w-1 bg-base-content/30 md:left-1/2 md:-ml-0.5"
          ></div>

          {#each milestones as milestone, index}
            <div
              class="relative mb-8 md:mb-12"
              in:animationDelay={800 + index * 150}
            >
              <div
                class={`flex items-center md:justify-center ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"}`}
              >
                <!-- Circle marker -->
                <div
                  class="absolute left-0 z-10 flex items-center justify-center md:static"
                >
                  <div
                    class="flex h-14 w-14 items-center justify-center rounded-full border-4 border-base-content bg-base-100 text-sm font-bold text-base-content shadow-md md:h-16 md:w-16 md:text-base"
                  >
                    {milestone.year}
                  </div>
                </div>

                <!-- Content -->
                <div
                  class={`ml-20 md:ml-0 ${index % 2 === 0 ? "md:ml-6 md:w-[calc(50%-44px)]" : "md:mr-6 md:w-[calc(50%-44px)] md:text-right"}`}
                >
                  <div class="rounded-lg bg-base-200 p-6 shadow-md">
                    <h3
                      class="mb-2 font-sans text-lg font-bold text-contrast-content md:text-xl"
                    >
                      {milestone.title}
                    </h3>
                    <p class="text-contrast-content/80">
                      {milestone.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</main>
