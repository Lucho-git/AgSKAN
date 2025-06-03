<script>
  import Marquee from "$lib/components/magic/marquee/Marquee.svelte"

  const partners = [
    {
      name: "Agribusiness Connect",
      logo: "/images/partnerLogos/AgribusinessConnect.png",
      alt: "Agribusiness Connect logo",
    },
    {
      name: "Agristart",
      logo: "/images/partnerLogos/agristart.png",
      alt: "Agristart logo",
    },
    {
      name: "Agtech and Logistics Hub",
      logo: "/images/partnerLogos/Agtech-and-Logistics-Hub.svg",
      alt: "Agtech and Logistics Hub logo",
    },
    {
      name: "Datafarming",
      logo: "/images/partnerLogos/Datafarming.svg",
      alt: "Datafarming logo",
    },
    {
      name: "Innovation Cluster",
      logo: "/images/partnerLogos/innovationcluster.png",
      alt: "Innovation Cluster logo",
    },
    {
      name: "Beanstalk",
      logo: "/images/partnerLogos/Beanstalk.png",
      alt: "Beanstalk logo",
    },
    {
      name: "Farm Weekly",
      logo: "/images/partnerLogos/farm_weekly.png",
      alt: "Farm Weekly logo",
    },
    {
      name: "GRDC",
      logo: "/images/partnerLogos/GRDC.png",
      alt: "GRDC logo",
    },
    {
      name: "Generation Ag",
      logo: "/images/partnerLogos/generationag.png",
      alt: "Generation Ag logo",
    },
    {
      name: "Mingenew Irwin Group",
      logo: "/images/partnerLogos/Mingenew-Irwin-Group.png",
      alt: "Mingenew Irwin Group logo",
    },
  ]
</script>

<section class="bg-gradient-to-b from-primary/5 to-base-100 py-10">
  <div class="section-container">
    <div class="mb-6 text-center">
      <p
        class="inline-block rounded-full bg-primary/10 px-6 py-2 text-sm font-medium uppercase tracking-wider text-contrast-content shadow-sm"
      >
        Trusted Partners
      </p>
    </div>

    <div
      class="relative flex h-28 w-full items-center justify-center overflow-hidden rounded-lg"
    >
      <Marquee pauseOnHover class="[--duration:30s]">
        {#each partners as partner}
          <div class="mx-6 flex min-w-[180px] items-center justify-center">
            <div
              class="hover:border-1 group relative flex h-16 w-44 transform items-center justify-center rounded-lg border border-base-100 bg-base-300 p-3 shadow-md transition-all duration-300 hover:z-10 hover:-translate-y-1 hover:scale-110 hover:border-secondary hover:shadow-xl"
            >
              <img
                src={partner.logo}
                alt={partner.alt}
                class="h-12 w-auto max-w-[140px] object-contain transition-all duration-200"
                loading="lazy"
              />
            </div>
          </div>
        {/each}
      </Marquee>

      <!-- Gradient overlays -->
      <div
        class="pointer-events-none absolute inset-y-0 left-0 z-20 w-12 bg-gradient-to-r from-base-100 to-transparent"
      ></div>
      <div
        class="pointer-events-none absolute inset-y-0 right-0 z-20 w-12 bg-gradient-to-l from-base-100 to-transparent"
      ></div>
    </div>
  </div>
</section>
