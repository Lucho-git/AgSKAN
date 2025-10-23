<script lang="ts">
  import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "$lib/components/ui/accordion"
  import { onMount } from "svelte"

  let mounted = false

  onMount(() => {
    mounted = true
  })

  const faqs = [
    {
      question: "Is AgSKAN right for me?",
      answer: `
      <div class="space-y-4">
        <p>AgSKAN works well for broadacre farmers, farm managers, agricultural contractors, operations with seasonal staff, and farms running mixed machinery fleets.</p>
        
        <p>Most people use AgSKAN to see where their team is and what coverage they've completed throughout the day. You get a live map showing what's happening across your farm in real-time.</p>
        
        <p>It's also handy for marking rocks, stumps, and firebreaks so everyone can see and avoid them. This helps prevent machinery damage and keeps hazards visible to the whole crew.</p>
        
        <p>If you're working with new team members or seasonal staff who don't know the property well, AgSKAN makes it easier to direct them around the farm. And since it works on any phone or tablet, it bridges the gap between different machinery brands - everyone sees the same live map regardless of what they're driving.</p>
      </div>`,
    },
    {
      question: "How do I set up AgSKAN?",
      answer: `
          <p>Getting started is quick and easy. Follow our <a href="/support?guide=quick-start" class="text-primary hover:underline">setup guide</a> to watch a short tutorial about setting up AgSKAN in under 4 minutes.</p>`,
    },
    {
      question: "How much does AgSKAN cost?",
      answer: `
          <p class="mb-4">AgSKAN costs $30 per month, per machine.</p>
          <p>In the billing section, a 'machine' represents each vehicle that will be tracked on your farm. As the account owner, you'll pay for all machines, which gives your account the authority to host other users on your live map.</p>
          <p class="mt-4 p-4 bg-base-300 rounded-lg">
            <strong>Example:</strong> You (map owner) + 2 full-time operators = 3 machines<br>
            Total cost: $90 per month for complete farm operation visibility
          </p>`,
    },
    {
      question: "What hardware do I need?",
      answer: `
      <div class="space-y-4">
        <p>AgSKAN works on any mobile device or tablet, but for permanent tractor setups, we recommend a dedicated tablet with a cab mount. Check our hardware recommendations list for the best options.</p>
        
        <p>Our phone app is perfect for testing the platform or quickly checking crew locations in the paddock. However, for all-day tracking and mapping work, a dedicated tablet delivers better performance and reliability.</p>
        
        <p class="mt-4"><strong>Robust Tablet Setup</strong></p>
        <p>For a reliable in-cab setup, you'll need three main components: a tablet with cellular capabilities, a cab mount, and a data plan.</p>
        
        <p class="p-4 bg-base-300 rounded-lg">
          <strong>Budget Android Setup:</strong> Around $600-$700 upfront<br>
          This includes an Android tablet, protective case, cab mount, and 12 months of prepaid data
        </p>
        
        <p>We also offer recommendations for premium setups with Apple or Samsung tablets. Check our detailed hardware page for specific models, mounting options, and purchase links.</p>
        
        <p class="text-sm text-contrast-content/70 mt-4">Note: We aren't affiliated with any brands - these are recommendations only based on what we think works well for farm use.</p>
      </div>`,
    },
    {
      question: "How does AgSKAN work with limited coverage?",
      answer: `
          <p>AgSKAN works in areas with limited mobile coverage. You'll need reception at the start of each mapping session to load the platform, but intermittent coverage throughout the day won't affect performance. The system automatically uploads data whenever it reconnects to the network.</p>`,
    },
    {
      question: "Will AgSKAN work for seeding?",
      answer: `
          <div class="space-y-4">
            <p>AgSKAN transforms your seeding operation with real-time mapping and collaboration:</p>
            <ul class="list-disc pl-6 space-y-2">
              <li>Use the sprayer to 'paint' a live map of sprayed areas</li>
              <li>Seeder operators can view the live map to ensure they only seed sprayed areas</li>
              <li>Mark fill-up truck locations with pin drops for the entire seeding crew</li>
              <li>Track and mark obstacles like rocks and stumps with one-touch marking</li>
              <li>Access the map on any mobile device</li>
            </ul>
            <p class="mt-4 p-4 bg-base-300 rounded-lg">
              <strong>Cost Example:</strong> Setting up a sprayer and seeder for 2025 costs just $60 per month, using only phones or tablets
            </p>
          </div>`,
    },
    {
      question: "Will AgSKAN work for harvest?",
      answer: `
          <div class="space-y-4">
            <p>AgSKAN streamlines harvest operations by connecting your entire team:</p>
            <ul class="list-disc pl-6 space-y-2">
              <li>Headers 'paint' a live map of harvested areas</li>
              <li>Chaser bin drivers can locate headers instantly without radio calls</li>
              <li>Mark field bin locations visible to all crew members</li>
              <li>Complete visibility for truck drivers and the entire harvest team</li>
              <li>Access from any mobile device</li>
            </ul>
            <p class="mt-4 p-4 bg-base-300 rounded-lg">
              <strong>Cost Example:</strong> Full harvest setup (2 headers + chaser bin + truck) = $122 per month
            </p>
          </div>`,
    },
    {
      question: "Will AgSKAN work for rock and stump picking?",
      answer: `
          <div class="space-y-4">
            <p>AgSKAN simplifies obstacle management across your operation:</p>
            <ul class="list-disc pl-6 space-y-2">
              <li>One-touch function to mark rocks and stumps instantly</li>
              <li>Live updates visible to all operators</li>
              <li>Streamlined obstacle clearing process</li>
              <li>Works in any tractor or vehicle</li>
            </ul>
          </div>`,
    },
    {
      question: "Can I upload my paddock boundaries onto the AgSKAN map?",
      answer: `
          <div class="space-y-4">
            <p>Yes, uploading paddock boundaries is quick and simple:</p>
            <ul class="list-disc pl-6 space-y-2">
              <li>Takes less than 5 minutes with existing paddock files</li>
              <li>Simple step-by-step process</li>
              <li>Supports common boundary file formats</li>
            </ul>
            <p>Follow our <a href="/support?guide=upload-boundaries" class="text-primary hover:underline">paddock boundary guide</a> for detailed instructions.</p>
          </div>`,
    },
    {
      question: "I can't find my paddock boundaries?",
      answer: `
          <div class="space-y-4">
            <p>Can't find your paddock boundaries? Check platforms you've used before - AgWorld, John Deere Operations Centre, or your tractor GPS screen likely have your mapping files. Your agronomist or farm advisor may have them too.</p>
            <p>Need help uploading? Contact us directly or email your paddock files with your full name and farm name and we'll upload them for you.</p>
            <p>Don't have paddock maps? No problem. Our tracking and mapping platform works perfectly without them. While some advanced features require boundary files, you can jump in and start using the core system right away.</p>
          </div>`,
    },
    {
      question: "How do I connect people to my map?",
      answer: `
          <div class="space-y-4">
            <p>Connecting team members is straightforward using the map ID link:</p>
            <ul class="list-disc pl-6 space-y-2">
              <li>Share the map ID link with your operators</li>
              <li>Team members can instantly join your live map</li>
              <li>No complicated setup required</li>
            </ul>
            <p>Need help finding the map ID? Check our <a href="/support?guide=share-map" class="text-primary hover:underline">sharing guide</a> for step-by-step instructions.</p>
          </div>`,
    },
  ]

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

<section class="bg-base-200" id="qanda">
  <div class="section-container py-20">
    {#if mounted}
      <div
        class="mx-auto max-w-3xl overflow-hidden rounded-xl border border-base-300 shadow-lg"
        in:animationDelay={0}
      >
        <!-- Yellow header with black text -->
        <div class="bg-neutral p-8 text-contrast">
          <h2 class="mb-4 text-center font-sans text-3xl font-bold">
            Frequently Asked Questions
          </h2>
          <p class="mx-auto max-w-2xl text-center text-contrast/80">
            Get quick answers to common questions about AgSKAN.
          </p>
        </div>

        <!-- FAQ Content with original accordion styling -->
        <div class="bg-base-100 p-6">
          <Accordion type="single" collapsible class="w-full space-y-4">
            {#each faqs as faq, i}
              <div in:animationDelay={100 + i * 50}>
                <AccordionItem value="item-{i}" class="border-b-0">
                  <AccordionTrigger
                    class="rounded-lg bg-base-200 px-6 py-4 text-left font-medium text-contrast-content hover:bg-base-300 [&[data-state=open]]:bg-base-300"
                  >
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent class="px-6 py-4 text-contrast-content">
                    {@html faq.answer}
                  </AccordionContent>
                </AccordionItem>
              </div>
            {/each}
          </Accordion>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  /* Remove default border from accordion items */
  :global([data-state="open"] > .accordion-trigger) {
    background-color: hsl(var(--b3));
  }
</style>
