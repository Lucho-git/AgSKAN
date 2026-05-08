# AgSKAN

AgSKAN is a field mapping and live machinery tracking app for farming teams. It records vehicle trails, shows shared map activity, supports offline field work, and packages the SvelteKit web app into native iOS and Android shells with Capacitor.

The app is intentionally built as a static Capacitor app. Client-side code talks directly to Supabase, Supabase Edge Functions, Stripe-hosted billing flows, Mapbox, and native Capacitor plugins. SvelteKit server routes are not part of the production runtime.

## Core Stack

- SvelteKit with static adapter
- Capacitor for iOS and Android packaging
- Supabase Auth, Postgres, Realtime, Storage, and Edge Functions
- Stripe Checkout and Stripe Customer Portal
- Mapbox GL, Mapbox Draw, Turf, and PostGIS-backed trail data
- Dexie/IndexedDB for offline queues and crash-safe sync
- TransistorSoft Background Geolocation and custom raw GPS plugins
- Tailwind CSS and DaisyUI

## App Areas

- Marketing, login, onboarding, account, and billing screens
- Map viewer with fields, markers, overlays, drawing tools, and trail layers
- Live vehicle state sharing through Supabase Realtime
- Foreground and background GPS tracking for native devices
- Offline persistence for pending trail coordinates, closures, and marker edits
- Supabase Edge Functions for billing, notifications, and contact flows

## Local Development

Install dependencies:

```sh
npm install
```

Run the web app locally:

```sh
npm run dev
```

Run checks:

```sh
npm run check
npm run lint
npm run format_check
npm run test
```

Build the static web app:

```sh
npm run build
```

## Environment

The app expects Supabase, Mapbox, Stripe, push notification, and email/contact related environment variables depending on which feature is being exercised. Common local variables include:

```sh
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PUBLIC_MAPBOX_ACCESS_TOKEN=
PUBLIC_SITE_NAME=AgSKAN
PUBLIC_APP_VERSION=
```

Private service-role and Stripe secrets are used by scripts or Supabase Edge Functions, not by the static client bundle.

## Static Runtime Notes

- The production app is generated with `@sveltejs/adapter-static` into `build/`.
- Capacitor packages the static build into the native projects under `ios/` and `android/`.
- Runtime backend behavior should live in Supabase, Supabase Edge Functions, Stripe, or Postgres RPCs.
- Avoid adding SvelteKit `+server` routes for production app behavior, since the app must keep working as a static native bundle.

## Native Builds

After a web build, sync Capacitor assets into native projects:

```sh
npx cap sync
```

Open native projects:

```sh
npx cap open ios
npx cap open android
```

## Repository Notes

- `src/lib/components/map` contains the main map, trail, marker, field, and vehicle UI.
- `src/lib/services` contains GPS/background/offline service code.
- `src/lib/api` contains client-side API wrappers for Supabase and Edge Functions.
- `supabase/functions` contains deployable Supabase Edge Functions.
- `scripts` contains operational maintenance scripts for trail, billing, and data cleanup work.