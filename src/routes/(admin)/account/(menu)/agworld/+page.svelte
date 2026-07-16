<script lang="ts">
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { goto } from "$app/navigation"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { supabase } from "$lib/supabaseClient"
  import ConsolidationMap from "$lib/components/map/ConsolidationMap.svelte"
  import FieldOutlineThumbnail from "$lib/components/map/FieldOutlineThumbnail.svelte"
  import {
    agworldAccountStore,
    agworldApiV3,
    AGWORLD_INSTANCES,
    type AgworldAccount,
    type AgworldRequestLog,
  } from "$lib/api/agworldApi"

  // Guard: redirect if not dev mode
  $: if (!$userSettingsStore.devToolsEnabled) {
    goto("/account")
  }

  // --- State ---
  let accounts: AgworldAccount[] = []
  let selectedAccountId: string | null = null
  let view: "list" | "add" | "account" | "compare" = "list"

  // Add form
  let newName = ""
  let newApiKey = ""
  let newInstance = "au"
  let newGrowerId = ""
  let adding = false

  // Account detail / API explorer
  let apiLoading = false
  let apiResult: any = null
  let apiError: string | null = null
  let apiStatus: number | null = null
  let apiVersion: "v2" | "v3" = "v3"

  // Request logs
  let requestLogs: AgworldRequestLog[] = []
  let expandedLogId: string | null = null

  // Quick-query state
  let queryEndpoint: string = "growers"
  let queryGrowerId: string = ""

  const QUICK_QUERIES = [
    { label: "List Growers", endpoint: "growers", needsGrower: false },
    { label: "List Farms", endpoint: "farms", needsGrower: true },
    { label: "List Fields", endpoint: "fields", needsGrower: true },
    { label: "List Field Boundaries", endpoint: "field-boundaries", needsGrower: true },
    { label: "List Field Crops", endpoint: "field-crops", needsGrower: true },
    { label: "List Actuals", endpoint: "actuals", needsGrower: true },
    { label: "List Observations", endpoint: "observations", needsGrower: true },
    { label: "List Plans", endpoint: "plans", needsGrower: true },
    { label: "List Recommendations", endpoint: "recommendations", needsGrower: true },
    { label: "List Work Orders", endpoint: "work-orders", needsGrower: true },
    { label: "Activity Operations", endpoint: "activity-ops", needsGrower: true },
    { label: "Product Applications", endpoint: "product-apps", needsGrower: true },
    { label: "Activity Seedings", endpoint: "seedings", needsGrower: true },
    { label: "Weather Records", endpoint: "weather", needsGrower: true },
    { label: "Activity Assets", endpoint: "activity-assets", needsGrower: true },
    { label: "Activity Problems", endpoint: "activity-problems", needsGrower: true },
    { label: "List Operators", endpoint: "operators", needsGrower: false },
    { label: "Search Products", endpoint: "search-products", needsGrower: false },
    { label: "Search Crop Varieties", endpoint: "search-crops", needsGrower: false },
  ]

  $: selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null
  $: instanceLabel = selectedAccount ? (AGWORLD_INSTANCES[selectedAccount.instance]?.label ?? 'US') : ''

  onMount(() => {
    accounts = agworldAccountStore.getAll()
  })

  // --- Add account ---
  async function handleAddAccount() {
    if (!newName.trim() || !newApiKey.trim()) {
      toast.error("Name and API key are required")
      return
    }
    adding = true
    try {
      agworldAccountStore.add(newName.trim(), newApiKey.trim(), newInstance, newGrowerId.trim())
      accounts = agworldAccountStore.getAll()
      newName = ""
      newApiKey = ""
      newInstance = "au"
      newGrowerId = ""
      view = "list"
      toast.success("Account added")
    } finally {
      adding = false
    }
  }

  // --- Remove account ---
  function handleRemove(id: string) {
    if (!confirm("Remove this account?")) return
    agworldAccountStore.remove(id)
    accounts = agworldAccountStore.getAll()
    if (selectedAccountId === id) {
      selectedAccountId = null
      view = "list"
    }
  }

  // --- Select account ---
  function selectAccount(id: string) {
    selectedAccountId = id
    view = "account"
    apiResult = null
    apiError = null
    apiStatus = null
    requestLogs = []
    expandedLogId = null
    // Auto-fill grower ID from account
    const acct = accounts.find((a) => a.id === id)
    queryGrowerId = acct?.growerId || ""
  }

  async function runQuery(endpoint: string) {
    if (!selectedAccount) return
    apiLoading = true
    apiError = null
    apiResult = null
    apiStatus = null

    try {
      let result: any
      const a = selectedAccount

      switch (endpoint) {
        case "growers":
          result = await agworldApiV3.listGrowers(a, { page: { size: 10 }, paginationLinks: true })
          break
        case "farms":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listFarms(a, queryGrowerId, { page: { size: 10 } })
          break
        case "fields":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listFields(a, queryGrowerId, { page: { size: 10 } })
          break
        case "field-boundaries":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listFieldBoundaries(a, queryGrowerId, { page: { size: 10 } })
          break
        case "field-crops":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listFieldCrops(a, queryGrowerId, { page: { size: 10 } })
          break
        case "actuals":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listActuals(a, queryGrowerId, { page: { size: 10 } })
          break
        case "observations":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listObservations(a, queryGrowerId, { page: { size: 10 } })
          break
        case "plans":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listPlans(a, queryGrowerId, { page: { size: 10 } })
          break
        case "recommendations":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listRecommendations(a, queryGrowerId, { page: { size: 10 } })
          break
        case "work-orders":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listWorkOrders(a, queryGrowerId, { page: { size: 10 } })
          break
        case "activity-ops":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listActivityOperations(a, queryGrowerId, { page: { size: 10 } })
          break
        case "product-apps":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listActivityProductApplications(a, queryGrowerId, { page: { size: 10 } })
          break
        case "seedings":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listActivitySeedings(a, queryGrowerId, { page: { size: 10 } })
          break
        case "weather":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listActivityWeatherRecords(a, queryGrowerId, { page: { size: 10 } })
          break
        case "activity-assets":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listActivityAssets(a, queryGrowerId, { page: { size: 10 } })
          break
        case "activity-problems":
          if (!queryGrowerId) { apiError = "Grower ID required"; apiLoading = false; return }
          result = await agworldApiV3.listActivityProblems(a, queryGrowerId, { page: { size: 10 } })
          break
        case "operators":
          result = await agworldApiV3.listOperators(a, { page: { size: 10 } })
          break
        case "search-products":
          result = await agworldApiV3.searchProducts(a, queryGrowerId || "glyphosate", { page: { size: 10 } })
          break
        case "search-crops":
          result = await agworldApiV3.searchCropVarieties(a, queryGrowerId || "wheat")
          break
        default:
          apiError = `Unknown endpoint: ${endpoint}`
          apiLoading = false
          return
      }

      if (result.log) {
        requestLogs = [result.log, ...requestLogs].slice(0, 20)
      }

      if (result.success) {
        apiResult = result.data
        apiStatus = result.status ?? null
      } else {
        apiError = result.error ?? "Unknown error"
        apiStatus = result.status ?? null
      }
    } catch (err: any) {
      apiError = err.message || "Unexpected error"
    } finally {
      apiLoading = false
    }
  }

  function formatJson(data: any): string {
    return JSON.stringify(data, null, 2)
  }

  function toggleLog(id: string) {
    expandedLogId = expandedLogId === id ? null : id
  }

  function clearLogs() {
    requestLogs = []
    expandedLogId = null
  }

  function copyLog(log: AgworldRequestLog) {
    const text = [
      `=== Agworld API Request Log ===`,
      `ID: ${log.id}`,
      `Time: ${log.timestamp}`,
      `API Version: ${log.apiVersion}`,
      `Instance: ${log.instance}`,
      ``,
      `=== REQUEST ===`,
      `${log.method} ${log.url}`,
      ``,
      `Headers:`,
      ...Object.entries(log.requestHeaders).map(([k, v]) => {
        const masked = k.toLowerCase() === 'authorization' ? v.substring(0, 20) + '...' : v
        return `  ${k}: ${masked}`
      }),
      ``,
      `=== RESPONSE ===`,
      `Status: ${log.status ?? 'N/A'} ${log.statusText ?? ''}`,
      `Duration: ${log.durationMs}ms`,
      ``,
      `Response Headers:`,
      ...(log.responseHeaders ? Object.entries(log.responseHeaders).map(([k, v]) => `  ${k}: ${v}`) : ['  (none)']),
      ``,
      `Response Body:`,
      log.responseBody || '(empty)',
      log.error ? `\n\nError: ${log.error}` : '',
      ``,
    ].join('\n')
    navigator.clipboard.writeText(text)
    toast.success("Request log copied")
  }

  function getStatusBadgeClass(status: number | undefined): string {
    if (!status) return "badge-ghost"
    if (status >= 200 && status < 300) return "badge-success"
    if (status >= 400) return "badge-error"
    return "badge-warning"
  }

  function backToList() {
    view = "list"
  }

  // --- Comparison state ---
  let compareLoading = false
  let compareLogs: AgworldRequestLog[] = []
  let agskanFields: any[] = []
  let agskanFarms: any[] = []
  let agworldFields: any[] = []
  let agworldFarms: any[] = []
  let agworldBoundaries: any[] = []
  let compareError: string | null = null
  let linkedFields: Map<string, string> = new Map() // AgSKAN fieldId → Agworld fieldId
  let mapFocus: { id: string; source: "agskan" | "agworld" } | null = null
  let mapCandidates: Array<{ id: string; name: string; source: "agskan" | "agworld"; overlapPct: number; areaHa: number; selected: boolean }> = []
  let categorized: any = { confirmed: [], review: [], unmatchedSkanNoOverlap: [], unmatchedSkanPartial: [], unmatchedAwNoOverlap: [], unmatchedAwPartial: [] }
  let reviewSkan: any[] = []
  let reviewAw: any[] = []
  let selectedCandidates = new Set<string>()
  let linkedAwIds = new Set<string>()
  let dominantSide: "agskan" | "agworld" = "agskan"
  let showSkan: any[] = []
  let showAw: any[] = []
  let inspectorSubject: { id: string; source: "agskan" | "agworld" } | null = null
  let highlightedCandidate: string | null = null
  let selectedOverlayIds: string[] = []
  let canonicalChoice: "agskan" | "agworld" | null = null
  let resolvedFields = new Set<string>()

  $: {
    if (!mapFocus) {
      showSkan = reviewSkan
      showAw = reviewAw
    } else if (dominantSide === "agskan") {
      showSkan = [...reviewSkan].sort((a, b) => (a.field_id === mapFocus.id ? -1 : 0))
      const connected = new Set<string>()
      const linkedAwId = linkedFields.get(mapFocus.id)
      if (linkedAwId) connected.add(linkedAwId)
      for (const c of mapCandidates) if (c.source === "agworld") connected.add(c.id)
      showAw = reviewAw.filter(f => connected.has(f.id))
    } else {
      showAw = [...reviewAw].sort((a, b) => (a.id === mapFocus.id ? -1 : 0))
      const connected = new Set<string>()
      const linkedEntry = Array.from(linkedFields.entries()).find(([, v]) => v === mapFocus.id)
      if (linkedEntry) connected.add(linkedEntry[0])
      for (const c of mapCandidates) if (c.source === "agskan") connected.add(c.id)
      showSkan = reviewSkan.filter(f => connected.has(f.field_id))
    }
  }

  async function startCompare() {
    if (!selectedAccount) return
    view = "compare"
    compareLoading = true
    compareError = null
    compareLogs = []
    agskanFields = []
    agskanFarms = []
    agworldFields = []
    agworldFarms = []
    agworldBoundaries = []

    try {
      const { data: session } = await supabase.auth.getSession()
      const userId = session?.session?.user?.id
      if (!userId) { compareError = "Not logged in to AgSKAN"; compareLoading = false; return }

      const { data: profile } = await supabase.from("profiles").select("master_map_id").eq("id", userId).single()
      const mapId = profile?.master_map_id
      if (!mapId) { compareError = "No AgSKAN map connected."; compareLoading = false; return }

      const { data: farms } = await supabase.from("farms").select("*").eq("map_id", mapId).order("name")
      agskanFarms = farms || []

      const { data: fields } = await supabase.from("fields").select("field_id, name, area, farm_id, boundary").eq("map_id", mapId).order("name").limit(100)
      agskanFields = fields || []

      // Compute area from geometry for AgSKAN (same turf method as Agworld)
      try {
        const turf = await import("@turf/turf")
        for (const skan of agskanFields) {
          if (skan.boundary?.type) {
            try {
              const feat = turf.feature(skan.boundary)
              skan._turfAreaHa = turf.area(feat) / 10000
            } catch { skan._turfAreaHa = null }
          }
        }
      } catch { /* non-critical */ }

      if (selectedAccount.growerId) {
        const [fwResult, fdResult, fbListResult] = await Promise.all([
          agworldApiV3.listFarms(selectedAccount, selectedAccount.growerId, { page: { size: 50 } }),
          agworldApiV3.listFields(selectedAccount, selectedAccount.growerId, { page: { size: 100 } }),
          agworldApiV3.listFieldBoundaries(selectedAccount, selectedAccount.growerId, { page: { size: 100 } }),
        ])

        if (fwResult.success) { agworldFarms = fwResult.data?.data || []; if (fwResult.log) compareLogs = [...compareLogs, fwResult.log] }
        if (fdResult.success) { agworldFields = fdResult.data?.data || []; if (fdResult.log) compareLogs = [...compareLogs, fdResult.log] }
        if (fbListResult.log) compareLogs = [...compareLogs, fbListResult.log]

        // Build field name lookup
        const fieldNames = new Map<string, string>()
        for (const f of agworldFields) fieldNames.set(f.id, f.attributes?.name || '')

        // Populate boundaries from list
        const allBounds: any[] = []
        for (const b of (fbListResult.data?.data || [])) {
          const fid = b.relationships?.field?.data?.id
          if (fid) {
            allBounds.push({ id: b.id, field_id: fid, name: fieldNames.get(fid) || '', area_scalar: null, area_units: null, boundary: null })
          }
        }

        // Fetch ALL boundaries with rate-limit throttling
        // Agworld limits: 4 concurrent, 200/min, 5000/hour
        const toFetch = allBounds
        let rateLimited = 0
        for (let i = 0; i < toFetch.length; i += 4) {
          const batch = toFetch.slice(i, i + 4)
          const results = await Promise.all(batch.map(b =>
            agworldApiV3.getFieldBoundary(selectedAccount, selectedAccount.growerId, b.id)
          ))
          results.forEach((res, idx) => {
            if (res.log) compareLogs = [...compareLogs, res.log]
            if (res.success && res.data?.data) {
              const d = res.data.data
              const b = batch[idx]
              const area = d.attributes?.area
              b.area_scalar = area?.scalar
              b.area_units = area?.units
              b.boundary = d.attributes?.boundary
            } else if (res.status === 429) {
              rateLimited++
            }
          })
          // Throttle: 4 req per 300ms = ~13 req/s = 800/min, well under 200/min limit
          if (i + 4 < toFetch.length) {
            await new Promise(r => setTimeout(r, 300))
          }
        }
        if (rateLimited > 0) {
          toast.warning(`${rateLimited} boundaries rate-limited. ${allBounds.filter(b => b.boundary).length}/${allBounds.length} loaded.`)
        }

        // Compute turf area for all loaded boundaries (same method as AgSKAN)
        try {
          const turf = await import("@turf/turf")
          for (const b of allBounds) {
            if (b.boundary?.type) {
              try { b._turfAreaHa = turf.area(turf.feature(b.boundary)) / 10000 } catch { b._turfAreaHa = null }
            }
          }
        } catch { /* non-critical */ }
        agworldBoundaries = allBounds
      } else {
        // No growerId set — skip Agworld fetch
      }

      // Always auto-link using combined name + geometry scoring
      if (agskanFields.length > 0 && agworldBoundaries.length > 0) {
        await autoLinkByGeometry()
      }
    } catch (e: any) {
      compareError = e.message
    } finally {
      compareLoading = false
    }
  }

  async function autoLinkByGeometry() {
    try {
      const turf = await import("@turf/turf")
      const newLinks = new Map(linkedFields)

      // --- Helper: intersect two GeoJSON geometries ---
      function intersectGeoms(g1: any, g2: any): any {
        if (!g1?.type || !g2?.type) return null
        const fc = {
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: g1, properties: {} },
            { type: "Feature", geometry: g2, properties: {} },
          ],
        }
        try { return turf.intersect(fc) } catch { return null }
      }

      for (const skan of agskanFields) {
        if (newLinks.has(skan.field_id)) continue
        if (!skan.boundary) continue

        let bestScore = 0
        let bestAwId = ""
        let bestAwOverlap = 0
        let bestAwOverlapSkan = 0
        let bestAwOverlapAw = 0

        for (const aw of agworldBoundaries) {
          if (!aw.boundary) continue
          const awFieldId = aw.field_id
          if (!awFieldId) continue

          try {
            const skanFeat = { type: "Feature", geometry: skan.boundary, properties: {} }
            const awFeat = { type: "Feature", geometry: aw.boundary, properties: {} }

            const skanArea = turf.area(skanFeat)
            const awArea = turf.area(awFeat)
            if (skanArea <= 0 || awArea <= 0) continue

            // Name score (0-1)
            const nameScore = findMatchScore(skan.name, aw.name || "") / 100

            // Area ratio (0-1)
            const areaRatio = Math.min(skanArea, awArea) / Math.max(skanArea, awArea)

            // Overlap: IoU for scoring + directional for display
            let overlapRatio = 0
            let overlapSkanPct = 0
            let overlapAwPct = 0
            const intersection = intersectGeoms(skan.boundary, aw.boundary)
            if (intersection) {
              const intersectArea = turf.area(intersection)
              if (intersectArea > 0) {
                overlapRatio = intersectArea / (skanArea + awArea - intersectArea)
                overlapSkanPct = Math.round(intersectArea / skanArea * 100)
                overlapAwPct = Math.round(intersectArea / awArea * 100)
              }
            }

            // Centroid distance score (0-1, 0 at 5km+)
            const skanCentroid = turf.centroid(skanFeat)
            const awCentroid = turf.centroid(awFeat)
            const distKm = turf.distance(skanCentroid, awCentroid)
            const distScore = Math.max(0, 1 - distKm / 5)

            // Adaptive scoring: exact name matches don't need geometry overlap
            let score: number
            if (nameScore >= 0.95) {
              // Exact/near-exact name: trust name + area, geometry is bonus
              score = (nameScore * 0.55 + areaRatio * 0.30 + distScore * 0.10 + overlapRatio * 0.05) * 100
            } else if (nameScore >= 0.80) {
              // Strong name match: less geometry required
              score = (nameScore * 0.40 + overlapRatio * 0.30 + areaRatio * 0.20 + distScore * 0.10) * 100
            } else {
              // Normal: geometry + name balanced
              score = (nameScore * 0.35 + overlapRatio * 0.35 + areaRatio * 0.15 + distScore * 0.15) * 100
            }

            if (score > bestScore && score >= 50) {
              bestScore = score
              bestAwId = awFieldId
              bestAwOverlap = overlapRatio
              bestAwOverlapSkan = overlapSkanPct
              bestAwOverlapAw = overlapAwPct
            }
          } catch { /* skip invalid geometries */ }
        }

        if (bestAwId) {
          newLinks.set(skan.field_id, bestAwId)
          skan._overlapPct = Math.round((bestAwOverlap || 0) * 100)
          skan._overlapSkanPct = bestAwOverlapSkan || 0
          skan._overlapAwPct = bestAwOverlapAw || 0
        }
      }

      linkedFields = newLinks
    } catch {
      // Auto-link failed silently — manual matching still works
    }
  }

  function linkFields(agskanId: string, agworldId: string) {
    linkedFields.set(agskanId, agworldId)
    linkedFields = linkedFields // trigger reactivity
    toast.success("Fields linked")
  }

  function unlinkField(agskanId: string) {
    linkedFields.delete(agskanId)
    linkedFields = linkedFields
  }

  function getLinkedAgworldId(agskanId: string): string | undefined {
    return linkedFields.get(agskanId)
  }

  function findMatchScore(agskanName: string, agworldName: string): number {
    const a = agskanName.toLowerCase().trim()
    const b = agworldName.toLowerCase().trim()
    if (a === b) return 100
    if (a.includes(b) || b.includes(a)) return 80
    // Check for common patterns like "W2" matching "W2" but not "W20"
    const aWords = a.split(/[\s_-]+/)
    const bWords = b.split(/[\s_-]+/)
    const matches = aWords.filter(w => bWords.includes(w)).length
    if (matches > 0) return 60 + matches * 10
    return 0
  }

  function backToAccount() {
    view = "account"
  }

  // --- Consolidation Categorization ---
  interface CategorizedLink {
    skan: any; aw: any; awB: any
    nameScore: number; areaRatio: number; overlapPct: number
    confidence: "confirmed" | "review"
  }

  function categorizeAll() {
    const confirmed: CategorizedLink[] = []
    const review: CategorizedLink[] = []
    const unmatchedSkanNoOverlap: any[] = []
    const unmatchedSkanPartial: any[] = []
    const unmatchedAwNoOverlap: any[] = []
    const unmatchedAwPartial: any[] = []

    const linkedAwIds = new Set(Array.from(linkedFields.values()))

    for (const skan of agskanFields) {
      const awId = linkedFields.get(skan.field_id)
      if (!awId) {
        unmatchedSkanNoOverlap.push(skan)
        continue
      }
      const aw = agworldFields?.find(f => f.id === awId)
      const awB = agworldBoundaries?.find(b => b.field_id === awId)

      const nameScore = aw?.attributes?.name
        ? findMatchScore(skan.name, aw.attributes.name)
        : 0
      const areaRatio = skan._turfAreaHa && awB?._turfAreaHa
        ? Math.min(skan._turfAreaHa, awB._turfAreaHa) / Math.max(skan._turfAreaHa, awB._turfAreaHa)
        : 0

      const overlapPct = areaRatio >= 0.95 ? 100 : areaRatio >= 0.8 ? 70 : 30

      const item: CategorizedLink = { skan, aw, awB, nameScore, areaRatio, overlapPct, confidence: "review" }

      if (nameScore >= 95 && areaRatio >= 0.95) {
        item.confidence = "confirmed"
        confirmed.push(item)
      } else {
        review.push(item)
      }
    }

    for (const aw of (agworldFields || [])) {
      if (linkedAwIds.has(aw.id)) continue
      // Skip fields with no boundary data (0 area = no geometry to compare)
      const awB = agworldBoundaries?.find(b => b.field_id === aw.id)
      if (!awB?.boundary?.type) continue
      unmatchedAwNoOverlap.push(aw)
    }

    return { confirmed, review, unmatchedSkanNoOverlap, unmatchedSkanPartial, unmatchedAwNoOverlap, unmatchedAwPartial }
  }

  // Inline reactive categorization
  $: {
    categorized = categorizeAll()
    linkedAwIds = new Set(Array.from(linkedFields.values()))
    const confirmedIds = new Set(categorized.confirmed.map((c: any) => c.skan?.field_id))
    reviewSkan = agskanFields.filter(f => linkedFields.has(f.field_id) && !confirmedIds.has(f.field_id) && !resolvedFields.has(f.field_id))
    const confirmedAwIds = new Set(categorized.confirmed.map((c: any) => c.aw?.id))
    reviewAw = agworldFields.filter(f => linkedAwIds.has(f.id) && !confirmedAwIds.has(f.id) && agworldBoundaries.some(b => b.field_id === f.id && b.boundary?.type))
  }
</script>

<div class="agworld-container">
  <!-- Header -->
  <div class="mb-6">
    <h1 class="text-2xl font-bold">Agworld Integration</h1>
    <p class="mt-1 text-sm opacity-60">
      Dev mode — Manage Agworld API accounts and test v2 + v3 API queries
    </p>
  </div>

  <!-- List View: Show all saved accounts -->
  {#if view === "list"}
    <div class="space-y-4">
      {#if accounts.length === 0}
        <div class="rounded-box bg-base-200 p-8 text-center">
          <Icon icon="solar:cloud-check-bold-duotone" width="48" height="48" class="mx-auto opacity-30" />
          <p class="mt-3 font-semibold opacity-60">No Agworld accounts configured</p>
          <p class="text-sm opacity-40">Add an account using an API key to get started.</p>
          <button
            class="btn btn-primary mt-4"
            on:click={() => (view = "add")}
          >
            <Icon icon="solar:add-circle-bold" width="20" height="20" />
            Add Account
          </button>
        </div>
      {:else}
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Saved Accounts ({accounts.length})</h2>
          <button
            class="btn btn-primary btn-sm"
            on:click={() => (view = "add")}
          >
            <Icon icon="solar:add-circle-bold" width="18" height="18" />
            Add Account
          </button>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each accounts as account (account.id)}
            <div class="card bg-base-200 transition-shadow hover:shadow-md cursor-pointer"
                 on:click={() => selectAccount(account.id)}
                 on:keydown={(e) => e.key === 'Enter' && selectAccount(account.id)}
                 role="button"
                 tabindex="0"
            >
              <div class="card-body p-4">
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <h3 class="card-title text-base truncate">{account.name}</h3>
                      <span class="badge badge-xs badge-outline">{AGWORLD_INSTANCES[account.instance]?.label ?? account.instance}</span>
                    </div>
                    <p class="mt-1 text-xs opacity-50 font-mono truncate" title={account.apiKey}>
                      {account.apiKey.substring(0, 24)}...
                    </p>
                    <p class="mt-2 text-xs opacity-40">
                      Added {new Date(account.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    class="btn btn-ghost btn-xs text-error ml-2 shrink-0"
                    on:click|stopPropagation={() => handleRemove(account.id)}
                    title="Remove account"
                  >
                    <Icon icon="solar:trash-bin-trash-bold" width="16" height="16" />
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- Add Account Form -->
  {:else if view === "add"}
    <div class="max-w-lg">
      <button class="btn btn-ghost btn-sm mb-4" on:click={backToList}>
        <Icon icon="solar:arrow-left-bold" width="18" height="18" />
        Back to accounts
      </button>

      <div class="card bg-base-200">
        <div class="card-body">
          <h2 class="card-title">
            <Icon icon="solar:user-plus-bold-duotone" width="24" height="24" />
            Add Agworld Account
          </h2>
          <p class="text-sm opacity-60">
            Enter a name, API key, and select the Agworld instance. The API key must use the <code class="badge badge-sm">v1_...</code> format.
          </p>

          <div class="form-control mt-4">
            <label class="label" for="account-name">
              <span class="label-text">Account Name</span>
            </label>
            <input
              id="account-name"
              type="text"
              class="input input-bordered"
              placeholder="e.g. Beau's Agworld"
              bind:value={newName}
            />
          </div>

          <div class="form-control mt-3">
            <label class="label" for="agworld-instance">
              <span class="label-text">Instance</span>
            </label>
            <select id="agworld-instance" class="select select-bordered" bind:value={newInstance}>
              {#each Object.entries(AGWORLD_INSTANCES) as [key, cfg]}
                <option value={key}>{cfg.label} — {cfg.base}</option>
              {/each}
            </select>
            <label class="label" for="agworld-instance">
              <span class="label-text-alt opacity-50">
                v3 base: {AGWORLD_INSTANCES[newInstance]?.base}/api/v3
              </span>
            </label>
          </div>

          <div class="form-control mt-3">
            <label class="label" for="grower-id-field">
              <span class="label-text">Default Grower ID (optional)</span>
              <span class="label-text-alt opacity-50">Auto-fills queries</span>
            </label>
            <input
              id="grower-id-field"
              type="text"
              class="input input-bordered font-mono"
              placeholder="e.g. 70719"
              bind:value={newGrowerId}
            />
          </div>

          <div class="form-control mt-3">
            <label class="label" for="api-key">
              <span class="label-text">API Key</span>
              <span class="label-text-alt opacity-50">v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</span>
            </label>
            <input
              id="api-key"
              type="password"
              class="input input-bordered font-mono"
              placeholder="v1_..."
              bind:value={newApiKey}
            />
          </div>

          <div class="card-actions mt-4 justify-end">
            <button class="btn btn-ghost" on:click={backToList}>Cancel</button>
            <button
              class="btn btn-primary"
              on:click={handleAddAccount}
              disabled={adding || !newName.trim() || !newApiKey.trim()}
            >
              {adding ? "Adding..." : "Add Account"}
            </button>
          </div>
        </div>
      </div>
    </div>

  <!-- Account Detail / API Explorer -->
  {:else if view === "account" && selectedAccount}
    <div>
      <button class="btn btn-ghost btn-sm mb-4" on:click={backToList}>
        <Icon icon="solar:arrow-left-bold" width="18" height="18" />
        Back to accounts
      </button>

      <!-- Account info bar -->
      <div class="card bg-base-200 mb-6">
        <div class="card-body p-4">
          <div class="flex flex-wrap items-center gap-4">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-semibold">{selectedAccount.name}</h2>
                <span class="badge badge-sm">{instanceLabel}</span>
              </div>
              <p class="text-xs opacity-50 font-mono mt-1" title={selectedAccount.apiKey}>
                Key: {selectedAccount.apiKey.substring(0, 24)}...
              </p>
              {#if selectedAccount.growerId}
                <p class="text-xs opacity-50 font-mono mt-1">
                  Grower: {selectedAccount.growerId}
                </p>
              {/if}
            </div>
            <div class="ml-auto flex gap-2">
              <button class="btn btn-primary btn-xs" on:click={startCompare}>
                <Icon icon="solar:graph-new-bold" width="14" height="14" />
                Compare
              </button>
              <button
                class="btn btn-ghost btn-xs text-error"
                on:click={() => {
                  handleRemove(selectedAccount.id)
                  backToList()
                }}
              >
                <Icon icon="solar:trash-bin-trash-bold" width="14" height="14" />
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- API Explorer -->
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Left: Quick Query Panel -->
        <div class="lg:col-span-1 space-y-4">
          <!-- Quick Queries -->
          <div class="card bg-base-200">
            <div class="card-body p-4">
              <h3 class="card-title text-base">
                <Icon icon="solar:play-circle-bold-duotone" width="20" height="20" />
                Quick Queries
              </h3>

              <div class="form-control mt-3">
                <label class="label py-1" for="grower-id">
                  <span class="label-text text-xs">Grower ID</span>
                </label>
                <input
                  id="grower-id"
                  type="text"
                  class="input input-bordered input-sm font-mono text-xs"
                  placeholder="CPY-AU-..."
                  bind:value={queryGrowerId}
                />
              </div>

              <button
                class="btn btn-primary btn-sm mt-3 w-full"
                on:click={() => runQuery(queryEndpoint)}
                disabled={apiLoading}
              >
                {#if apiLoading}
                  <span class="loading loading-spinner loading-xs"></span>
                  Querying...
                {:else}
                  <Icon icon="solar:play-bold" width="16" height="16" />
                  Run Query
                {/if}
              </button>

              <div class="mt-3 space-y-1">
                {#each QUICK_QUERIES as q}
                  <button
                    class="btn btn-ghost btn-sm w-full justify-start text-left"
                    class:btn-active={queryEndpoint === q.endpoint}
                    on:click={() => (queryEndpoint = q.endpoint)}
                  >
                    <Icon
                      icon={queryEndpoint === q.endpoint ? "solar:play-circle-bold" : "solar:play-circle-linear"}
                      width="16" height="16"
                    />
                    {q.label}
                    {#if q.needsGrower}
                      <span class="ml-auto text-xs opacity-40">needs grower</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- API Docs Quick Reference -->
          <div class="card bg-base-200">
            <div class="card-body p-4">
              <h3 class="card-title text-base">
                <Icon icon="solar:bookmark-bold-duotone" width="20" height="20" />
                API Reference
              </h3>
              <div class="text-xs opacity-50 space-y-2 mt-2">
                <p><strong>Base:</strong> <code class="badge badge-sm">{AGWORLD_INSTANCES[selectedAccount.instance]?.base}/api/v3</code></p>
                <p><strong>Auth:</strong> <code class="badge badge-sm">API-Key v1_...</code></p>
                <p><strong>Spec:</strong> JSON:API</p>
                <hr class="opacity-20" />
                <p><strong>Rate Limits:</strong></p>
                <ul class="list-disc ml-4">
                  <li>4 concurrent requests</li>
                  <li>200 req/min</li>
                  <li>5000 req/hour</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Results + Request Logs -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Response -->
          <div class="card bg-base-200">
            <div class="card-body p-4">
              <div class="flex items-center justify-between">
                <h3 class="card-title text-base">
                  <Icon icon="solar:document-text-bold-duotone" width="20" height="20" />
                  Response
                </h3>
                <div class="flex items-center gap-2">
                  {#if apiStatus !== null}
                    <span class="badge badge-sm {getStatusBadgeClass(apiStatus)}">
                      HTTP {apiStatus}
                    </span>
                  {/if}
                  {#if apiResult}
                    <button
                      class="btn btn-ghost btn-xs"
                      on:click={() => {
                        navigator.clipboard.writeText(formatJson(apiResult))
                        toast.success("Copied to clipboard")
                      }}
                    >
                      <Icon icon="solar:copy-bold" width="14" height="14" />
                      Copy
                    </button>
                  {/if}
                </div>
              </div>

              <div class="mt-3">
                {#if apiLoading}
                  <div class="flex items-center justify-center py-12">
                    <span class="loading loading-spinner loading-lg"></span>
                  </div>
                {:else if apiError}
                  <div class="alert alert-error">
                    <Icon icon="solar:danger-circle-bold" width="20" height="20" />
                    <span class="text-sm">{apiError}</span>
                  </div>
                {:else if apiResult}
                  <pre class="bg-base-300 rounded-box p-4 text-xs overflow-auto max-h-[500px]"><code>{formatJson(apiResult)}</code></pre>
                {:else}
                  <div class="flex flex-col items-center justify-center py-12 opacity-30">
                    <Icon icon="solar:cloud-arrow-up-bold-duotone" width="48" height="48" />
                    <p class="mt-3 text-sm">Run a query to see the API response</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Request Logs -->
          {#if requestLogs.length > 0}
            <div class="card bg-base-200">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <h3 class="card-title text-base">
                    <Icon icon="solar:list-check-bold-duotone" width="20" height="20" />
                    Request Logs ({requestLogs.length})
                  </h3>
                  <button class="btn btn-ghost btn-xs text-error" on:click={clearLogs}>
                    <Icon icon="solar:eraser-bold" width="14" height="14" />
                    Clear
                  </button>
                </div>

                <div class="mt-3 space-y-2">
                  {#each requestLogs as log (log.id)}
                    <div class="rounded-box bg-base-300 overflow-hidden">
                      <!-- Log summary row -->
                      <button
                        class="w-full flex items-center gap-3 p-3 text-left hover:bg-base-100 transition-colors"
                        on:click={() => toggleLog(log.id)}
                      >
                        <span class="badge badge-xs {getStatusBadgeClass(log.status)} shrink-0">
                          {log.status ?? 'ERR'}
                        </span>
                        <span class="badge badge-xs badge-outline shrink-0">{log.apiVersion}</span>
                        <code class="text-xs flex-1 truncate">{log.method} {log.url}</code>
                        <span class="text-xs opacity-50 shrink-0">{log.durationMs}ms</span>
                        <Icon
                          icon={expandedLogId === log.id ? "solar:alt-arrow-up-bold" : "solar:alt-arrow-down-bold"}
                          width="14" height="14"
                          class="shrink-0"
                        />
                      </button>

                      <!-- Expanded detail -->
                      {#if expandedLogId === log.id}
                        <div class="border-t border-base-100 p-3 text-xs space-y-3">
                          <!-- Request -->
                          <div>
                            <div class="font-semibold mb-1 text-info">▶ REQUEST</div>
                            <div class="bg-base-100 rounded p-2 space-y-1">
                              <div><span class="opacity-50">Time:</span> {log.timestamp}</div>
                              <div><span class="opacity-50">API:</span> {log.apiVersion} · {log.instance}</div>
                              <div><span class="opacity-50">URL:</span> <code class="break-all">{log.url}</code></div>
                              <div class="mt-1"><span class="opacity-50">Headers:</span></div>
                              {#each Object.entries(log.requestHeaders) as [key, val]}
                                <div class="ml-2">
                                  <code class="opacity-50">{key}:</code>
                                  {#if key.toLowerCase() === 'authorization'}
                                    <code class="text-warning">{val.substring(0, 24)}...</code>
                                  {:else}
                                    <code>{val}</code>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          </div>

                          <!-- Response -->
                          <div>
                            <div class="font-semibold mb-1" class:text-success={log.status && log.status < 300} class:text-error={log.status && log.status >= 400}>
                              ◀ RESPONSE ({log.status} {log.statusText ?? ''}) — {log.durationMs}ms
                            </div>
                            <div class="bg-base-100 rounded p-2 space-y-1">
                              {#if log.error}
                                <div class="text-error mb-1">Error: {log.error}</div>
                              {/if}
                              {#if log.responseHeaders && Object.keys(log.responseHeaders).length > 0}
                                <details class="mt-2">
                                  <summary class="cursor-pointer opacity-50 hover:opacity-100">Response Headers ({Object.keys(log.responseHeaders).length})</summary>
                                  <div class="mt-1">
                                    {#each Object.entries(log.responseHeaders) as [key, val]}
                                      <div class="ml-2"><code class="opacity-50">{key}:</code> <code>{val}</code></div>
                                    {/each}
                                  </div>
                                </details>
                              {/if}
                              {#if log.responseBody}
                                <details class="mt-2">
                                  <summary class="cursor-pointer opacity-50 hover:opacity-100">Response Body ({log.responseBody.length} chars)</summary>
                                  <pre class="mt-2 bg-base-300 rounded p-2 max-h-[300px] overflow-auto"><code>{log.responseBody.length > 2000 ? log.responseBody.substring(0, 2000) + '\n... (truncated, see copy)' : log.responseBody}</code></pre>
                                </details>
                              {/if}
                            </div>
                          </div>

                          <button class="btn btn-ghost btn-xs" on:click={() => copyLog(log)}>
                            <Icon icon="solar:copy-bold" width="12" height="12" />
                            Copy full log
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

  <!-- Compare View -->
  {:else if view === "compare"}
    <div>
      <button class="btn btn-ghost btn-sm mb-4" on:click={() => (view = "account")}>
        <Icon icon="solar:arrow-left-bold" width="18" height="18" />
        Back to account
      </button>

      <div class="mb-4">
        <h2 class="text-xl font-bold">
          <Icon icon="solar:graph-new-bold-duotone" width="24" height="24" class="inline mr-2" />
          AgSKAN ↔ Agworld Comparison
        </h2>
        <p class="text-sm opacity-50 mt-1">
          {selectedAccount?.name} — Grower: {selectedAccount?.growerId || "not set"}
        </p>
      </div>

      {#if compareLoading}
        <div class="flex items-center justify-center py-12">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      {:else if compareError}
        <div class="alert alert-error">
          <Icon icon="solar:danger-circle-bold" width="20" height="20" />
          <span>{compareError}</span>
        </div>
      {:else}
        {@const totalUnmatched = categorized.unmatchedSkanNoOverlap.length + categorized.unmatchedAwNoOverlap.length}

        <!-- Summary cards -->
        <div class="grid grid-cols-5 gap-3 mb-6">
          <div class="card bg-base-200"><div class="card-body p-3 text-center"><div class="text-2xl font-bold">{agskanFields.length}</div><div class="text-xs opacity-50">AgSKAN</div></div></div>
          <div class="card bg-base-200"><div class="card-body p-3 text-center"><div class="text-2xl font-bold">{agworldFields.length}</div><div class="text-xs opacity-50">Agworld</div></div></div>
          <div class="card bg-base-200"><div class="card-body p-3 text-center"><div class="text-2xl font-bold text-success">{linkedFields.size}</div><div class="text-xs opacity-50">Linked</div></div></div>
          <div class="card bg-base-200"><div class="card-body p-3 text-center"><div class="text-2xl font-bold text-warning">{categorized.review.length}</div><div class="text-xs opacity-50">Need Review</div></div></div>
          <div class="card bg-warning/10"><div class="card-body p-3 text-center"><div class="text-2xl font-bold text-warning">{totalUnmatched}</div><div class="text-xs opacity-50">Unmatched</div></div></div>
        </div>

        <!-- API Logs (collapsed by default) -->
        {#if compareLogs.length > 0}
          <details class="mb-6">
            <summary class="text-xs opacity-40 cursor-pointer hover:opacity-80">
              {compareLogs.length} API calls · {agworldBoundaries.filter(b => b.boundary).length} boundaries loaded
            </summary>
            <!-- logs collapsed by default -->
          </details>
        {/if}

        <!-- SECTION 1: Confirmed Matches -->
        {#if categorized.confirmed.length > 0}
          <div class="mb-6">
            <h3 class="text-lg font-semibold mb-3">
              <Icon icon="solar:check-circle-bold" width="20" height="20" class="inline mr-1 text-success" />
              Confirmed Matches
              <span class="text-sm opacity-50 ml-2">({categorized.confirmed.length} fields — same name, area & boundary)</span>
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {#each categorized.confirmed as item (item?.skan?.field_id || '')}
                <div class="card bg-success/5 border border-success/20">
                  <div class="card-body p-3">
                    <div class="flex items-start gap-2">
                      <FieldOutlineThumbnail boundary={item.skan.boundary} width={44} height={32} fillColor="#22c55e" outlineColor="#86efac" />
                      {#if item.awB?.boundary}
                        <FieldOutlineThumbnail boundary={item.awB.boundary} width={44} height={32} fillColor="#22c55e" outlineColor="#86efac" />
                      {/if}
                    </div>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="badge badge-xs badge-success">✓</span>
                      <span class="text-sm font-mono truncate">{item.skan.name}</span>
                    </div>
                    <div class="text-xs opacity-50 mt-1">
                      {(item.skan._turfAreaHa || item.skan.area || 0).toFixed(1)} ha ↔ {(item.awB?._turfAreaHa || item.awB?.area_scalar || 0).toFixed(1)} ha
                    </div>
                    <button class="btn btn-ghost btn-xs text-error mt-1"
                      on:click={() => unlinkField(item.skan.field_id)}>
                      Unlink
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- SECTION 2: Unmatched (no overlap) Fields -->
        {#if categorized.unmatchedAwNoOverlap.length > 0 || categorized.unmatchedSkanNoOverlap.length > 0}
          <div class="mb-6">
            <h3 class="text-lg font-semibold mb-3">
              <Icon icon="solar:map-point-bold" width="20" height="20" class="inline mr-1 opacity-50" />
              Unmatched Fields
              <span class="text-sm opacity-50 ml-2">(no matching counterpart found)</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {#if categorized.unmatchedSkanNoOverlap.length > 0}
                <div class="card border border-dashed border-info/30 bg-info/5">
                  <div class="card-body p-3">
                    <h4 class="text-sm font-semibold text-info">
                      <Icon icon="solar:map-arrow-right-bold" width="14" height="14" class="inline mr-1" />
                      Only in AgSKAN ({categorized.unmatchedSkanNoOverlap.length})
                    </h4>
                    <div class="text-xs mt-2 space-y-1 max-h-[200px] overflow-auto">
                      {#each categorized.unmatchedSkanNoOverlap as f}
                        <label class="flex items-center gap-2 p-1 rounded hover:bg-base-200 cursor-pointer">
                          <FieldOutlineThumbnail boundary={f.boundary} width={32} height={22} fillColor="#0080ff" outlineColor="#bfffbf" />
                          <input type="checkbox" class="checkbox checkbox-xs" checked={true} />
                          <span class="font-mono truncate flex-1">{f.name}</span>
                          <span class="opacity-40 shrink-0">{(f._turfAreaHa || f.area || 0).toFixed(1)} ha</span>
                        </label>
                      {/each}
                    </div>
                    <button class="btn btn-xs btn-outline btn-info mt-2 w-full" disabled>
                      <Icon icon="solar:map-arrow-right-bold" width="12" height="12" />
                      Export to Agworld
                    </button>
                  </div>
                </div>
              {/if}
              {#if categorized.unmatchedAwNoOverlap.length > 0}
                <div class="card border border-dashed border-warning/30 bg-warning/5">
                  <div class="card-body p-3">
                    <h4 class="text-sm font-semibold text-warning">
                      <Icon icon="solar:map-arrow-left-bold" width="14" height="14" class="inline mr-1" />
                      Only in Agworld ({categorized.unmatchedAwNoOverlap.length})
                    </h4>
                    <div class="text-xs mt-2 space-y-1 max-h-[200px] overflow-auto">
                      {#each categorized.unmatchedAwNoOverlap as f}
                        {@const awB = agworldBoundaries.find(b => b.field_id === f.id)}
                        <label class="flex items-center gap-2 p-1 rounded hover:bg-base-200 cursor-pointer">
                          <FieldOutlineThumbnail boundary={awB?.boundary} width={32} height={22} fillColor="#ff8040" outlineColor="#ffb080" />
                          <input type="checkbox" class="checkbox checkbox-xs" checked={true} />
                          <span class="font-mono truncate flex-1">{f.attributes?.name || f.id}</span>
                          <span class="opacity-40 shrink-0">{(awB?._turfAreaHa || awB?.area_scalar || 0).toFixed(1)} ha</span>
                        </label>
                      {/each}
                    </div>
                    <button class="btn btn-xs btn-outline btn-warning mt-2 w-full" disabled>
                      <Icon icon="solar:map-arrow-left-bold" width="12" height="12" />
                      Import to AgSKAN
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- SECTION 3: Field Inspector -->
        {#if reviewSkan.length > 0 || reviewAw.length > 0}
          <div class="mb-6">
            <div class="flex items-center gap-3 mb-3">
              <h3 class="text-lg font-semibold">
                <Icon icon="solar:danger-triangle-bold" width="20" height="20" class="inline mr-1 text-warning" />
                Needs Review
                <span class="text-sm opacity-50 ml-2">({reviewSkan.length + reviewAw.length} fields)</span>
              </h3>
              <span class="text-xs opacity-40 ml-auto">Click a field to inspect</span>
            </div>

            {#if !inspectorSubject}
              <!-- Default: two-column list -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 class="text-xs font-semibold mb-2 text-info">AgSKAN ({reviewSkan.length})</h4>
                  <div class="space-y-1 max-h-[400px] overflow-auto">
                    {#each reviewSkan as skan (skan.field_id)}
                      {@const awId = linkedFields.get(skan.field_id)}
                      {@const aw = agworldFields.find(f => f.id === awId)}
                      <button class="w-full text-left p-2 rounded hover:bg-base-200 flex items-start gap-2"
                        on:click={() => { inspectorSubject = { id: skan.field_id, source: "agskan" }; mapFocus = { id: skan.field_id, source: "agskan" }; mapCandidates = [] }}>
                        <FieldOutlineThumbnail boundary={skan.boundary} width={36} height={24} fillColor="#0080ff" outlineColor="#bfffbf" />
                        <div class="flex-1 min-w-0">
                          <div class="flex justify-between"><span class="text-xs font-mono truncate">{skan.name}</span><span class="text-xs opacity-50">{(skan._turfAreaHa || skan.area || 0).toFixed(1)} ha</span></div>
                          <div class="text-xs opacity-40">↔ {aw?.attributes?.name || '?'}</div>
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
                <div>
                  <h4 class="text-xs font-semibold mb-2 text-warning">Agworld ({reviewAw.length})</h4>
                  <div class="space-y-1 max-h-[400px] overflow-auto">
                    {#each reviewAw as aw (aw.id)}
                      {@const linkedEntry = Array.from(linkedFields.entries()).find(([, v]) => v === aw.id)}
                      {@const linkedSkan = linkedEntry ? agskanFields.find(f => f.field_id === linkedEntry[0]) : null}
                      {@const awB = agworldBoundaries.find(b => b.field_id === aw.id)}
                      <button class="w-full text-left p-2 rounded hover:bg-base-200 flex items-start gap-2"
                        on:click={() => { inspectorSubject = { id: aw.id, source: "agworld" }; mapFocus = { id: aw.id, source: "agworld" }; mapCandidates = [] }}>
                        <FieldOutlineThumbnail boundary={awB?.boundary} width={36} height={24} fillColor="#ff8040" outlineColor="#ffb080" />
                        <div class="flex-1 min-w-0">
                          <div class="flex justify-between"><span class="text-xs font-mono truncate">{aw.attributes?.name}</span><span class="text-xs opacity-50">{(awB?._turfAreaHa || awB?.area_scalar || 0).toFixed(1)} ha</span></div>
                          <div class="text-xs opacity-40">↔ {linkedSkan?.name || '?'}</div>
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            {:else}
              <!-- Inspector Mode -->
              {@const subjectField = inspectorSubject.source === "agskan"
                ? agskanFields.find(f => f.field_id === inspectorSubject.id)
                : agworldFields.find(f => f.id === inspectorSubject.id)}
              {@const subjectBoundary = inspectorSubject.source === "agskan"
                ? subjectField?.boundary
                : agworldBoundaries.find(b => b.field_id === inspectorSubject.id)?.boundary}
              {@const subjectName = inspectorSubject.source === "agskan" ? subjectField?.name : subjectField?.attributes?.name}
              {@const subjectArea = inspectorSubject.source === "agskan"
                ? (subjectField?._turfAreaHa || subjectField?.area || 0)
                : (agworldBoundaries.find(b => b.field_id === inspectorSubject.id)?._turfAreaHa || 0)}

              {@const linkedId = inspectorSubject.source === "agskan"
                ? linkedFields.get(inspectorSubject.id)
                : (Array.from(linkedFields.entries()).find(([, v]) => v === inspectorSubject.id)?.[0] || null)}
              {@const linkedCandidate = linkedId ? mapCandidates.find(c => c.id === linkedId) : null}
              {@const extraCandidates = mapCandidates.filter(c => c.id !== linkedId)}
              {@const replaceCount = (linkedCandidate ? 1 : 0) + extraCandidates.length}

              <div class="relative">
                <!-- Floating inspector panel -->
                <div class="absolute top-3 left-3 w-[340px] max-h-[calc(100%-24px)] overflow-auto z-10">
                  <!-- Subject -->
                  <div class="card bg-base-200/95 backdrop-blur shadow-lg mb-2">
                    <div class="card-body p-3">
                      <div class="text-xs font-semibold opacity-50 mb-1">Inspecting</div>
                      <FieldOutlineThumbnail boundary={subjectBoundary} width={310} height={140} fillColor={inspectorSubject.source === "agskan" ? "#00ff88" : "#ffcc00"} outlineColor="#fff" />
                      <div class="flex items-center gap-2 mt-2">
                        <span class="badge badge-sm" class:badge-primary={inspectorSubject.source === "agskan"} class:badge-warning={inspectorSubject.source === "agworld"}>
                          {inspectorSubject.source === "agskan" ? "AgSKAN" : "Agworld"}
                        </span>
                        <span class="text-sm font-semibold">{subjectName}</span>
                        <span class="text-xs opacity-50 ml-auto">{subjectArea.toFixed(1)} ha</span>
                      </div>
                    </div>
                  </div>

                  <!-- Counterparts -->
                  <div class="card bg-base-200/95 backdrop-blur shadow-lg mb-2">
                    <div class="card-body p-3">
                      <div class="text-xs font-semibold opacity-50 mb-2">
                        {inspectorSubject.source === "agskan" ? "Agworld" : "AgSKAN"} counterpart{mapCandidates.length !== 1 ? 's' : ''}
                      </div>

                      {#each mapCandidates as cand, ci (cand.id + '-' + ci)}
                        {@const candBoundary = cand.source === "agskan"
                          ? (agskanFields.find(f => f.field_id === cand.id)?.boundary)
                          : (agworldBoundaries.find(b => b.field_id === cand.id)?.boundary)}
                        {@const isSelected = selectedOverlayIds.includes(cand.id)}
                        {@const selClass = isSelected ? ' bg-success/20 ring-1 ring-success' : ''}
                        <button class="w-full text-left p-2 rounded mb-1 hover:bg-base-300 flex items-start gap-3{selClass}"
                          on:click={() => {
                            selectedOverlayIds = isSelected
                              ? selectedOverlayIds.filter(id => id !== cand.id)
                              : [...selectedOverlayIds, cand.id]
                            highlightedCandidate = cand.id
                          }}>
                          <FieldOutlineThumbnail boundary={candBoundary} width={48} height={34} fillColor={cand.source === "agskan" ? "#0080ff" : "#ff8040"} outlineColor={cand.source === "agskan" ? "#bfffbf" : "#ffb080"} />
                          <div class="flex-1 min-w-0">
                            <div class="flex justify-between"><span class="text-xs font-mono font-semibold truncate">{cand.name}</span><span class="text-xs opacity-50 ml-1">{cand.areaHa} ha</span></div>
                            <span class="badge badge-xs mt-0.5" class:badge-success={cand.overlapPct >= 70} class:badge-warning={cand.overlapPct >= 30} class:badge-error={cand.overlapPct < 30}>{cand.overlapPct}% overlap</span>
                          </div>
                        </button>
                      {/each}
                      {#if mapCandidates.length === 0}
                        <div class="text-xs opacity-40 italic">No overlapping fields found on {inspectorSubject.source === "agskan" ? "Agworld" : "AgSKAN"}.</div>
                      {/if}
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="card bg-base-200/95 backdrop-blur shadow-lg">
                    <div class="card-body p-3">
                      <div class="text-xs font-semibold opacity-50 mb-2">
                        {selectedOverlayIds.length > 0 ? `${selectedOverlayIds.length} selected` : 'Select counterpart(s) above'}
                      </div>
                      <div class="text-xs opacity-50 mb-2">Whose boundary to keep?</div>
                      <label class="flex items-center gap-2 p-1.5 rounded hover:bg-base-300 cursor-pointer">
                        <input type="radio" class="radio radio-xs radio-primary" bind:group={canonicalChoice} value={inspectorSubject.source} />
                        <span class="text-xs">Keep {inspectorSubject.source === "agskan" ? "AgSKAN" : "Agworld"} boundary ({subjectArea.toFixed(1)} ha)</span>
                      </label>
                      <label class="flex items-center gap-2 p-1.5 rounded hover:bg-base-300 cursor-pointer">
                        <input type="radio" class="radio radio-xs radio-warning" bind:group={canonicalChoice} value={inspectorSubject.source === "agskan" ? "agworld" : "agskan"} />
                        <span class="text-xs">Use {inspectorSubject.source === "agskan" ? "Agworld" : "AgSKAN"} boundary instead</span>
                      </label>

                      {#if canonicalChoice && selectedOverlayIds.length > 0}
                        <button class="btn btn-sm btn-success mt-2 w-full"
                          on:click={() => {
                            if (inspectorSubject.source === "agskan") {
                              const skan = agskanFields.find(f => f.field_id === inspectorSubject.id)
                              if (skan) skan._canonical = canonicalChoice
                              resolvedFields.add(inspectorSubject.id)
                              for (const candId of selectedOverlayIds) resolvedFields.add(candId)
                            } else {
                              const linkedEntry = Array.from(linkedFields.entries()).find(([, v]) => v === inspectorSubject.id)
                              if (linkedEntry) {
                                const skan = agskanFields.find(f => f.field_id === linkedEntry[0])
                                if (skan) skan._canonical = canonicalChoice
                                resolvedFields.add(linkedEntry[0])
                                for (const candId of selectedOverlayIds) resolvedFields.add(candId)
                              }
                            }
                            resolvedFields = resolvedFields
                            inspectorSubject = null; mapFocus = null; mapCandidates = []; canonicalChoice = null; highlightedCandidate = null; selectedOverlayIds = []
                          }}>
                          <Icon icon="solar:check-circle-bold" width="14" height="14" />
                          Confirm ({selectedOverlayIds.length + 1} fields resolved)
                        </button>
                      {/if}
                      <button class="btn btn-sm btn-ghost mt-1 w-full" on:click={() => { inspectorSubject = null; mapFocus = null; mapCandidates = []; highlightedCandidate = null; canonicalChoice = null; selectedOverlayIds = [] }}>
                        <Icon icon="solar:close-circle-bold" width="14" height="14" /> Back to list
                      </button>
                    </div>
                  </div>
                </div>

              <!-- Map (full width) -->
                <ConsolidationMap
                    {agskanFields}
                    {agworldBoundaries}
                    {linkedFields}
                    focusField={mapFocus}
                    highlightFieldId={highlightedCandidate}
                    selectedFieldIds={selectedOverlayIds}
                    height={520}
                    inspectorMode={true}
                    on:toggleCandidate={(e) => {
                      const id = e.detail.id
                      selectedOverlayIds = selectedOverlayIds.includes(id)
                        ? selectedOverlayIds.filter(i => i !== id)
                        : [...selectedOverlayIds, id]
                      highlightedCandidate = id
                    }}
                    on:focusChange={(e) => {
                      mapCandidates = e.detail.candidates || []
                      selectedCandidates = new Set(mapCandidates.filter(c => c.selected).map(c => c.id))
                    }}
                  />
              </div>
            {/if}
          </div>
        {/if}

        {#if categorized.confirmed.length === 0 && categorized.review.length === 0 && categorized.unmatchedSkanNoOverlap.length === 0 && categorized.unmatchedAwNoOverlap.length === 0}
          <div class="card bg-base-200 mb-6">
            <div class="card-body p-6 text-center">
              <Icon icon="solar:map-point-bold" width="40" height="40" class="opacity-20 mx-auto mb-3" />
              <p class="opacity-50">No fields to display.</p>
              <p class="text-xs opacity-30 mt-1">{agskanFields.length} AgSKAN · {agworldFields.length} Agworld · {linkedFields.size} linked</p>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
