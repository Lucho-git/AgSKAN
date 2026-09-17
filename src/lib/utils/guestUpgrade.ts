// src/lib/utils/guestUpgrade.ts
//
// Shared "Create account" routing for guest (anonymous) sessions.
//
// The map owner decides PER INVITE whether guests keep their map access after
// signing up (InviteToMapModal "Keep their access after signup" checkbox →
// map_invites.retain_on_signup → copied onto profiles.retain_after_signup when
// the guest redeems the link):
//
//   - box ticked  → /guest/upgrade — an in-app signup that upgrades this
//                   anonymous session into a real account, so the guest stays
//                   joined to the map (access becomes permanent).
//   - not ticked  → the usual signup flow at /login?tab=sign_up. The guest
//                   session is ended first because the login page redirects
//                   any active session away (see login/+page.ts).

import { goto } from "$app/navigation"
import { supabase } from "$lib/stores/sessionStore"

export async function goToGuestSignup() {
  let keepAccess = false
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (uid) {
      const { data } = await supabase
        .from("profiles")
        .select("retain_after_signup")
        .eq("id", uid)
        .single()
      keepAccess = !!data?.retain_after_signup
    }
  } catch (error) {
    console.warn("Guest signup check failed:", error)
  }

  if (keepAccess) {
    goto("/guest/upgrade")
    return
  }

  // Usual signup flow — end the anonymous guest session first (the login
  // page bounces any signed-in session to /account).
  try {
    await supabase.auth.signOut({ scope: "local" })
  } catch (error) {
    console.warn("Guest sign-out before signup failed:", error)
  }
  goto("/login?tab=sign_up")
}
