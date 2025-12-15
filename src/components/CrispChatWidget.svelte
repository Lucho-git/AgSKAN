<script lang="ts">
  import { onMount } from "svelte"
  import { Crisp } from "crisp-sdk-web"
  import { screenSize } from "$lib/stores/screenSizeStore"
  import { page } from "$app/stores"
  import { derived } from "svelte/store"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"

  const WEBSITE_ID = "961bded6-4b5a-45e3-8a71-a57bcc27934a"
  let isInitialized = false
  export let visible = false

  const shouldShowDrawer = derived(
    page,
    ($page) => !$page.url.pathname.includes("/account/mapviewer"),
  )

  // Handle user information updates
  $: if (isInitialized && $profileStore?.id) {
    setUserInfo()
  }

  function setUserInfo() {
    if (isInitialized && $profileStore?.id) {
      try {
        // Check if values are actually defined before setting them
        const email = $profileStore.email
        const fullName = $profileStore.full_name
        const companyName = $profileStore.company_name
        const website = $profileStore.website

        // Only set values that actually exist
        if (email) {
          Crisp.user.setEmail(email)
        }

        if (fullName) {
          Crisp.user.setNickname(fullName)
        }

        // For session data, only include properties that exist
        const sessionData = {}
        if (companyName) sessionData.company = companyName
        if (website) sessionData.website = website

        // Only call setData if we have at least one property
        if (Object.keys(sessionData).length > 0) {
          Crisp.session.setData(sessionData)
        }
      } catch (error) {
        console.error("Error setting Crisp user info:", error)
      }
    }
  }

  function handleNewMessage(message: any) {
    const from = message.from === "operator" ? "Support Team" : "You"
    const content = message.content

    // Only show notification for messages from operator and when chat is not visible
    if (message.from === "operator" && !visible) {
      toast.message("New Message", {
        description: `${from}: ${content}`,
        duration: 90000,
        action: {
          label: "Open Chat",
          onClick: () => toggleChat(true), // Pass true to force open
        },
      })
    }
  }

  // Only handle route changes after initial setup
  let previousDrawerState = $shouldShowDrawer
  $: if (isInitialized && $shouldShowDrawer !== previousDrawerState) {
    previousDrawerState = $shouldShowDrawer
    if (!$shouldShowDrawer) {
      visible = false
      updateCrispVisibility(false)
    } else {
      // When returning to a screen where drawer should show
      visible = $screenSize === "lg"
      updateCrispVisibility(visible)
    }
  }

  function waitForCrispElement(): Promise<Element> {
    return new Promise((resolve) => {
      const check = () => {
        const element = document.querySelector(".crisp-client")
        if (element) {
          console.log("Crisp element found")
          resolve(element)
        } else {
          console.log("Waiting for Crisp element...")
          setTimeout(check, 100)
        }
      }
      check()
    })
  }

  async function initCrispChat() {
    console.log("initCrispChat called, isInitialized:", isInitialized)
    if (!isInitialized) {
      try {
        console.log("Configuring Crisp...")
        Crisp.configure(WEBSITE_ID, {
          autoload: true,
        })

        console.log("Waiting for Crisp to initialize...")
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (window.$crisp) {
              clearInterval(interval)
              resolve()
            }
          }, 100)
        })

        console.log("$crisp loaded, waiting for DOM element...")
        await waitForCrispElement()

        console.log("Crisp fully initialized, setting up initial state")

        // Set initial visibility based on both screen size AND drawer state
        visible = $screenSize === "lg" && $shouldShowDrawer
        updateCrispVisibility(visible)

        if (!visible) {
          window.$crisp.push(["do", "chat:hide"])
        }

        // Set up event listeners
        window.$crisp.push([
          "on",
          "chat:closed",
          () => {
            console.log("Chat closed by Crisp UI")
            visible = false
            // Only update visibility if on small screen
            if ($screenSize === "sm") {
              updateCrispVisibility(false)
            }
          },
        ])

        // Add message received listener
        window.$crisp.push(["on", "message:received", handleNewMessage])

        isInitialized = true
        console.log("Initialization complete")

        // Initialize user info after Crisp is fully initialized
        if ($profileStore?.id) {
          // Delay setting user info slightly to ensure Crisp is fully ready
          setTimeout(() => {
            setUserInfo()
          }, 500)
        }
      } catch (error) {
        console.error("Error initializing Crisp:", error)
        isInitialized = false
      }
    }
  }

  function updateCrispVisibility(isVisible: boolean) {
    console.log("updateCrispVisibility called with:", isVisible)
    const crispFrame = document.querySelector(".crisp-client")
    if (crispFrame) {
      console.log("Updating Crisp visibility:", isVisible)
      crispFrame.classList.toggle("crisp-hidden", !isVisible)
      if (!isVisible) {
        window.$crisp.push(["do", "chat:hide"])
      }
    }
  }

  export function toggleChat(forceOpen = false) {
    console.log("toggleChat called, current visible state:", visible)
    if (!isInitialized) {
      console.log("Not initialized, calling initCrispChat")
      initCrispChat()
      return
    }

    // If forceOpen is true, bypass the shouldShowDrawer check
    if (!$shouldShowDrawer && !forceOpen) {
      return
    }

    visible = !visible
    if (forceOpen) {
      visible = true
    }

    console.log("New visible state:", visible)
    updateCrispVisibility(visible)

    if (visible) {
      console.log("Opening chat")
      Crisp.chat.open()
    }
  }

  onMount(() => {
    console.log("Component mounted")
    initCrispChat()
  })
</script>

<style>
  :global(.crisp-hidden) {
    display: none !important;
  }
</style>
