<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import { Card } from "$lib/components/ui/card"
  import { Linkedin } from "lucide-svelte"
  import MagicCard from "$lib/components/magic/magiccard/MagicCard.svelte"
  import BoxReveal from "$lib/components/magic/box-reveal/BoxReveal.svelte"
  import BlurFade from "$lib/components/magic/blur-fade/BlurFade.svelte"
  import { onMount } from "svelte"

  let BLUR_FADE_DELAY = 0.04
  let isLoaded = false

  onMount(() => {
    isLoaded = true
  })

  interface TeamMember {
    name: string
    role: string
    bio: string
    linkedIn: string
    gradientColor: string
  }

  const teamMembers: TeamMember[] = [
    {
      name: "Lachie Ross",
      role: "CTO",
      bio: "Lachie is a software engineer with a degree in Computer Science from Curtin University. He has been involved in many startups and innovations, he brings a wealth of technical knowledge to SKAN. His dad grew up on a farm in regional WA, Lachie may be removed from agriculture but it is certainly in his blood.",
      linkedIn: "https://www.linkedin.com/in/lachlan-f-ross/",
      gradientColor: "#2EFFBD",
    },
    {
      name: "Ryan Skamp",
      role: "CEO",
      bio: "Ryan has over 5000+ hours of machinery operating experience after spending 5+ years working in the Agricultural industry. He is applying these industry insights to build a program that will make farmers' lives easier. He has lived and breathed this issue and is energised to fix it.",
      linkedIn: "https://www.linkedin.com/in/ryan-skamp-a3b41a2b2/",
      gradientColor: "#FF7700",
    },
  ]
</script>

<div class="container mx-auto px-4 pb-16">
  <div class="h-12"></div>

  <!-- Our Story Section -->
  <div class="mx-auto max-w-4xl">
    <BlurFade delay={BLUR_FADE_DELAY}>
      <h1 class="mb-8 text-center text-4xl font-bold">Our Story</h1>
    </BlurFade>

    <BlurFade delay={BLUR_FADE_DELAY * 1.5}>
      <Card
        class="mb-12 transform bg-base-200 p-6 transition-all duration-300 hover:scale-[1.02]"
      >
        <p class="text-lg leading-relaxed text-base-content/90">
          Ryan and Lachie grew up together and have been mates for over 20
          years. They bring their life experience and skills together to solve
          an immense problem in the agricultural industry. Innovation and
          teamwork are at the heart of SKAN.
        </p>
      </Card>
    </BlurFade>

    <!-- Team Photo -->
    <div class="mb-12">
      <BoxReveal>
        <div
          class="transform overflow-hidden rounded-xl bg-base-100 transition-all duration-500 hover:scale-[1.02]"
        >
          <div class="aspect-video">
            <img
              src="/images/team.jpg"
              alt="SKAN Team"
              class="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
            />
          </div>
        </div>
      </BoxReveal>
    </div>

    <!-- Team Member Bios -->
    <div class="mb-24 grid gap-8 md:grid-cols-2">
      {#each teamMembers as member, i}
        <BlurFade delay={BLUR_FADE_DELAY * (3 + i)}>
          <a
            href={member.linkedIn}
            target="_blank"
            rel="noopener noreferrer"
            class="block h-full"
          >
            <MagicCard
              gradientColor={member.gradientColor}
              gradientOpacity={0.1}
              gradientSize={300}
              class="transform bg-base-200 transition-all duration-300 hover:scale-[1.02]"
            >
              <div class="group w-full p-6">
                <div class="mb-4 flex items-start justify-between">
                  <div>
                    <h3
                      class="mb-2 text-2xl font-bold text-base-content transition-colors duration-300"
                      style="--hover-color: {member.gradientColor}"
                    >
                      {member.name}
                    </h3>
                    <h4 class="text-xl text-primary">{member.role}</h4>
                  </div>
                  <Linkedin
                    class="h-5 w-5 text-primary transition-all duration-300 group-hover:scale-110"
                    style="--hover-color: {member.gradientColor}"
                  />
                </div>
                <p class="text-base-content/90">{@html member.bio}</p>
              </div>
            </MagicCard>
          </a>
        </BlurFade>
      {/each}
    </div>

    <!-- Our Vision Section -->
    <div class="mb-24">
      <BlurFade delay={BLUR_FADE_DELAY * 5}>
        <h2 class="mb-8 text-center text-4xl font-bold">Our Vision</h2>
        <Card
          class="transform bg-base-200 p-6 transition-all duration-300 hover:scale-[1.02]"
        >
          <p class="text-lg leading-relaxed text-base-content/90">
            To reduce input costs for farmers. We want to reduce machine hours
            and carbon emissions to make a genuine real world impact on modern
            day agriculture, one paddock at a time. SKAN the horizon.
          </p>
        </Card>
      </BlurFade>
    </div>
  </div>
</div>

<style>
  /* Smooth transitions */
  :global(*) {
    transition-property: transform, opacity, color;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
</style>
