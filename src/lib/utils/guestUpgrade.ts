// src/lib/utils/guestUpgrade.ts
//
// Shared "Create account" entry point for guest (anonymous) sessions — routes
// to the guest signup page, which adapts to the invite's "Keep their access
// after signup" checkbox (map_invites.retain_on_signup → copied onto
// profiles.retain_after_signup at redeem time, see
// supabase/migrations/add_invite_retain_on_signup.sql):
//
//   - ticked  → the guest upgrades in place: they stay joined to the map and
//               the access becomes permanent.
//   - unticked → the guest STAYS on the map while they fill the form; only on
//               SUBMIT are they removed (map disconnect + session end) and a
//               fresh account is created toward the usual /account setup.
//
// The page decides which mode applies (it loads the profile itself), so this
// helper exists so both call sites share one entry point.

import { goto } from "$app/navigation"

export function goToGuestSignup() {
  goto("/guest/upgrade")
}
