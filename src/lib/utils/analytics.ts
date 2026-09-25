// src/lib/utils/analytics.ts
// Google Tag Manager / Google Ads event helper.
// Pushes an event onto the GTM data layer; safe to call anywhere (no-ops
// during SSR or when the data layer is unavailable).

type DataLayerPayload = Record<string, unknown>

export function pushDataLayerEvent(
  event: string,
  payload: DataLayerPayload = {},
): void {
  if (typeof window === "undefined") return
  const w = window as unknown as { dataLayer?: DataLayerPayload[] }
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({ event, ...payload })
}
