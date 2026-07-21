<script lang="ts">
  import { onMount } from "svelte"
  import { fade } from "svelte/transition"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { goto } from "$app/navigation"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { supabase } from "$lib/supabaseClient"
  import ConsolidationMap from "$lib/components/map/ConsolidationMap.svelte"
  import ConsolidationShell from "$lib/components/map/ConsolidationShell.svelte"
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
    linkSearchQuery = ""
    linkSearchResults = []
  }

  // --- Link Agworld account to a specific AgSKAN customer's map ---
  let linkSearchQuery = ""
  let linkSearchResults: Array<{ id: string; email: string; full_name: string; master_map_id: string | null }> = []
  let linkSearching = false

  async function searchAgskanProfiles() {
    const q = linkSearchQuery.trim()
    if (!q) { linkSearchResults = []; return }
    linkSearching = true
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, master_map_id")
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(10)
      linkSearchResults = error ? [] : (data || [])
    } finally {
      linkSearching = false
    }
  }

  function linkAccountToProfile(profile: { email: string; full_name: string; master_map_id: string | null }) {
    if (!selectedAccount) return
    if (!profile.master_map_id) {
      toast.error("This profile has no AgSKAN map assigned")
      return
    }
    agworldAccountStore.update(selectedAccount.id, {
      linkedMapId: profile.master_map_id,
      linkedProfileLabel: profile.full_name || profile.email,
    })
    accounts = agworldAccountStore.getAll()
    linkSearchResults = []
    linkSearchQuery = ""
    toast.success(`Linked to ${profile.full_name || profile.email}`)
  }

  function unlinkAccount() {
    if (!selectedAccount) return
    agworldAccountStore.update(selectedAccount.id, { linkedMapId: "", linkedProfileLabel: "" })
    accounts = agworldAccountStore.getAll()
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
  let compareToken = 0 // incremented per startCompare() call to guard against overlapping/stale async runs
  let compareLogs: AgworldRequestLog[] = []
  let agskanFields: any[] = []
  let agskanFarms: any[] = []
  let agworldFields: any[] = []
  let agworldFarms: any[] = []
  let agworldBoundaries: any[] = []
  let compareError: string | null = null

  // --- Consolidated field package (the output) ---
  interface ConsolidatedField {
    id: string
    name: string
    boundary: any
    area_ha: number
    name_source: "agskan" | "agworld"
    geometry_source: "agskan" | "agworld"
    category: "identical" | "basically_identical" | "auto_imported" | "merged"
    agskan: { keep: string[]; create: boolean; delete: string[] }
    agworld: { keep: string[]; create: boolean; delete: string[] }
  }
  let consolidatedFields: ConsolidatedField[] = []

  // --- Categorization results ---
  let identicalPairs: any[] = []          // IoU=1.0 + name exact → locked
  let basicallyIdenticalPairs: any[] = [] // same name+IoU≥0.95 OR diff name+IoU=1.0 → choose dominant
  let autoImportedSkan: any[] = []        // 0 overlap → import to agworld
  let autoImportedAw: any[] = []          // 0 overlap → import to agskan
  let reviewSkan: any[] = []              // needs manual merge via map
  let reviewAw: any[] = []

  // Resolved tracking (removed from lists after approval)
  let resolvedSkanIds = new Set<string>()
  let resolvedAwIds = new Set<string>()

  // --- Inspector state (review section) ---
  // Connected group: all fields directly overlapping (with 5% threshold)
  let connectedGroup: { skanIds: string[]; awIds: string[] } | null = null
  // The proposed outcome: "match" (1-to-1), "merge" (N→1), or "split" (1→N)
  let proposalType: "match" | "merge" | "split" | null = null
  // For match: the two fields being compared; for merge/split: the single dominant field
  let proposalDominant: { id: string; source: "agskan" | "agworld" } | null = null
  // The other fields involved (opposite side for match, candidates for merge/split)
  let proposalCandidates: Array<{ id: string; name: string; source: "agskan" | "agworld"; overlapPct: number; areaHa: number }> = []
  let mapFocus: { id: string; source: "agskan" | "agworld" } | null = null
  let highlightedCandidate: string | null = null
  let selectedOverlayIds: string[] = []
  // For match: independent choice of boundary and name source
  let boundaryChoice: "agskan" | "agworld" = "agskan"
  let nameChoice: "agskan" | "agworld" = "agskan"
  let finalFieldName: string = ""  // editable name for the final consolidated field
  // For split: editable names for each resulting field
  let splitFieldNames: string[] = []
  // For split scenarios: user picks which side wins
  let dominantSideChoice: "agskan" | "agworld" = "agskan"
  let dominantFieldIds: string[] = []  // which fields appear dominant on the map (cyan)

  // --- Review fullscreen overlay (same shell as the consolidated preview) ---
  let reviewOverlayDismissed = false
  $: showReviewOverlay = view === "compare" && !compareLoading && !reviewOverlayDismissed && (reviewSkan.length > 0 || reviewAw.length > 0)

  // --- Consolidated preview fullscreen ---
  let showConsolidatedPreview = false
  let selectedPreviewId: string | null = null
  let editingPreviewName: string = ""
  let editingPreviewArea: number = 0
  let previewSearchQuery: string = ""
  let previewNameInputEl: HTMLInputElement
  let previewAreaInputEl: HTMLInputElement
  let savedFlash = false
  let savedFlashTimeout: ReturnType<typeof setTimeout> | null = null
  function flashSaved() {
    savedFlash = true
    if (savedFlashTimeout) clearTimeout(savedFlashTimeout)
    savedFlashTimeout = setTimeout(() => { savedFlash = false }, 1400)
  }

  function commitPreviewName() {
    const cf = consolidatedFields.find(f => f.id === selectedPreviewId)
    if (cf) { cf.name = editingPreviewName; consolidatedFields = consolidatedFields }
    flashSaved()
  }
  function commitPreviewArea() {
    editingPreviewArea = Math.round(editingPreviewArea * 10) / 10
    const cf = consolidatedFields.find(f => f.id === selectedPreviewId)
    if (cf) { cf.area_ha = editingPreviewArea; consolidatedFields = consolidatedFields }
    flashSaved()
  }
  function advanceToNextPreviewField() {
    const list = [...consolidatedFields].sort((a, b) => a.name.localeCompare(b.name))
    const idx = list.findIndex(f => f.id === selectedPreviewId)
    if (idx === -1 || list.length === 0) return
    const next = list[(idx + 1) % list.length]
    if (next) {
      selectedPreviewId = next.id
      editingPreviewName = next.name
      editingPreviewArea = Math.round(next.area_ha * 10) / 10
      setTimeout(() => previewNameInputEl?.focus(), 0)
    }
  }

  function deletePreviewField() {
    if (!selectedPreviewId) return
    const list = [...consolidatedFields].sort((a, b) => a.name.localeCompare(b.name))
    const idx = list.findIndex(f => f.id === selectedPreviewId)
    consolidatedFields = consolidatedFields.filter(f => f.id !== selectedPreviewId)
    if (list.length > 1) {
      const next = list[(idx + 1) % list.length]
      selectedPreviewId = next.id === selectedPreviewId ? (list[(idx + 2) % list.length]?.id ?? null) : next.id
      const cf = consolidatedFields.find(f => f.id === selectedPreviewId)
      if (cf) { editingPreviewName = cf.name; editingPreviewArea = Math.round(cf.area_ha * 10) / 10 }
      else { selectedPreviewId = null }
    } else {
      selectedPreviewId = null
    }
    toast.success("Field deleted")
  }

  // --- Duplicate name validation ---
  function findDuplicateField(name: string, excludeId?: string) {
    const n = (name || "").trim().toLowerCase()
    if (!n) return null
    return consolidatedFields.find(f => f.id !== excludeId && f.name.trim().toLowerCase() === n) || null
  }

  async function startCompare() {
    if (!selectedAccount || compareLoading) return
    const myCompareToken = ++compareToken
    view = "compare"
    compareLoading = true
    compareError = null
    compareLogs = []
    agskanFields = []
    agskanFarms = []
    agworldFields = []
    agworldFarms = []
    agworldBoundaries = []
    reviewOverlayDismissed = false

    try {
      let mapId: string | null = null

      if (selectedAccount.linkedMapId) {
        // This Agworld account is explicitly linked to a specific AgSKAN customer's map
        mapId = selectedAccount.linkedMapId
      } else {
        const { data: session } = await supabase.auth.getSession()
        const userId = session?.session?.user?.id
        if (!userId) { compareError = "Not logged in to AgSKAN"; compareLoading = false; return }

        const { data: profile } = await supabase.from("profiles").select("master_map_id").eq("id", userId).single()
        mapId = profile?.master_map_id
      }
      if (!mapId) { compareError = "No AgSKAN map connected. Link this account to a customer profile below to compare their specific map."; compareLoading = false; return }

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
          if (myCompareToken !== compareToken) return // a newer compare has started — abandon this one
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

      // Categorize all fields by IoU overlap
      if (myCompareToken !== compareToken) return // a newer compare has started — abandon this one
      if (agskanFields.length > 0 && agworldBoundaries.length > 0) {
        await categorizeFields()
      }
    } catch (e: any) {
      compareError = e.message
    } finally {
      if (myCompareToken === compareToken) compareLoading = false
    }
  }

  // --- IoU-based categorization ---
  async function categorizeFields() {
    const turf = await import("@turf/turf")

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

    // Compute IoU for all agskan × agworld pairs
    const allPairs: Array<{ skanId: string; awId: string; iou: number; nameScore: number }> = []
    for (const skan of agskanFields) {
      if (!skan.boundary) continue
      const skanFeat = { type: "Feature", geometry: skan.boundary, properties: {} }
      const skanArea = turf.area(skanFeat)
      if (skanArea <= 0) continue

      for (const awB of agworldBoundaries) {
        if (!awB.boundary) continue
        const awFeat = { type: "Feature", geometry: awB.boundary, properties: {} }
        const awArea = turf.area(awFeat)
        if (awArea <= 0) continue

        let iou = 0
        const intersection = intersectGeoms(skan.boundary, awB.boundary)
        if (intersection) {
          const intersectArea = turf.area(intersection)
          if (intersectArea > 0) {
            iou = intersectArea / (skanArea + awArea - intersectArea)
          }
        }

        const awField = agworldFields.find(f => f.id === awB.field_id)
        const nameScore = findMatchScore(skan.name, awField?.attributes?.name || "")

        allPairs.push({ skanId: skan.field_id, awId: awB.field_id, iou, nameScore })
      }
    }

    // Greedy 1-to-1 matching: sort by IoU desc, assign if both unassigned
    const sortedPairs = [...allPairs].sort((a, b) => b.iou - a.iou)
    const matchedSkan = new Set<string>()
    const matchedAw = new Set<string>()
    const matchedPairs: Array<{ skan: any; aw: any; awB: any; iou: number; nameScore: number }> = []

    for (const p of sortedPairs) {
      if (p.iou < 0.01) break
      if (matchedSkan.has(p.skanId) || matchedAw.has(p.awId)) continue
      const skan = agskanFields.find(f => f.field_id === p.skanId)
      const aw = agworldFields.find(f => f.id === p.awId)
      const awB = agworldBoundaries.find(b => b.field_id === p.awId)
      if (!skan || !aw || !awB) continue // stale/mismatched data (e.g. account switched mid-fetch) — skip rather than crash downstream
      matchedPairs.push({ skan, aw, awB, iou: p.iou, nameScore: p.nameScore })
      matchedSkan.add(p.skanId)
      matchedAw.add(p.awId)
    }

    // Categorize matched pairs
    for (const p of matchedPairs) {
      if (p.iou >= 0.9999 && p.nameScore >= 100) {
        identicalPairs.push(p)
      } else if ((p.nameScore >= 95 && p.iou >= 0.95) || p.iou >= 0.9999) {
        basicallyIdenticalPairs.push(p)
      } else {
        // Imperfect 1-to-1 match → review
        reviewSkan.push(p.skan)
        reviewAw.push(p.aw)
      }
    }

    // Unmatched agskan fields
    for (const skan of agskanFields) {
      if (matchedSkan.has(skan.field_id) || !skan.boundary) continue
      const hasOverlap = allPairs.some(p => p.skanId === skan.field_id && p.iou > 0.01)
      if (hasOverlap) {
        reviewSkan.push(skan)
      } else {
        autoImportedSkan.push(skan)
      }
    }

    // Unmatched agworld fields (deduplicate by field_id — multiple boundaries can exist per field)
    const seenAwFieldIds = new Set<string>()
    for (const awB of agworldBoundaries) {
      if (matchedAw.has(awB.field_id) || !awB.boundary) continue
      if (seenAwFieldIds.has(awB.field_id)) continue
      seenAwFieldIds.add(awB.field_id)
      const hasOverlap = allPairs.some(p => p.awId === awB.field_id && p.iou > 0.01)
      if (hasOverlap) {
        const awField = agworldFields.find(f => f.id === awB.field_id)
        if (awField) reviewAw.push(awField)
      } else {
        autoImportedAw.push(awB)
      }
    }

    // Auto-add identical pairs to consolidated
    for (const p of identicalPairs) {
      consolidatedFields = [...consolidatedFields, {
        id: crypto.randomUUID(),
        name: p.skan.name,
        boundary: p.skan.boundary,
        area_ha: Math.round((p.skan._turfAreaHa || 0) * 10) / 10,
        name_source: "agskan" as const,
        geometry_source: "agskan" as const,
        category: "identical" as const,
        agskan: { keep: [p.skan.field_id], create: false, delete: [] },
        agworld: { keep: [p.awB.field_id], create: false, delete: [] },
      }]
      resolvedSkanIds.add(p.skan.field_id)
      resolvedAwIds.add(p.awB.field_id)
    }

    // Auto-add basically-identical pairs to consolidated too — if they need no real decision,
    // there's nothing to "confirm"; default to AgSKAN name & geometry (editable later in the preview)
    for (const p of basicallyIdenticalPairs) {
      consolidatedFields = [...consolidatedFields, {
        id: crypto.randomUUID(),
        name: p.skan.name,
        boundary: p.skan.boundary,
        area_ha: Math.round((p.skan._turfAreaHa || 0) * 10) / 10,
        name_source: "agskan" as const,
        geometry_source: "agskan" as const,
        category: "basically_identical" as const,
        agskan: { keep: [p.skan.field_id], create: false, delete: [] },
        agworld: { keep: [p.awB.field_id], create: false, delete: [] },
      }]
      resolvedSkanIds.add(p.skan.field_id)
      resolvedAwIds.add(p.awB.field_id)
    }

    // Auto-add auto-imported to consolidated
    for (const skan of autoImportedSkan) {
      consolidatedFields = [...consolidatedFields, {
        id: crypto.randomUUID(),
        name: skan.name,
        boundary: skan.boundary,
        area_ha: Math.round((skan._turfAreaHa || 0) * 10) / 10,
        name_source: "agskan" as const,
        geometry_source: "agskan" as const,
        category: "auto_imported" as const,
        agskan: { keep: [skan.field_id], create: false, delete: [] },
        agworld: { keep: [], create: true, delete: [] },
      }]
      resolvedSkanIds.add(skan.field_id)
    }

    for (const awB of autoImportedAw) {
      const awField = agworldFields.find(f => f.id === awB.field_id)
      consolidatedFields = [...consolidatedFields, {
        id: crypto.randomUUID(),
        name: awField?.attributes?.name || "",
        boundary: awB.boundary,
        area_ha: Math.round((awB._turfAreaHa || 0) * 10) / 10,
        name_source: "agworld" as const,
        geometry_source: "agworld" as const,
        category: "auto_imported" as const,
        agskan: { keep: [], create: true, delete: [] },
        agworld: { keep: [awB.field_id], create: false, delete: [] },
      }]
      resolvedAwIds.add(awB.field_id)
    }

    // Trigger reactivity
    consolidatedFields = consolidatedFields
    resolvedSkanIds = resolvedSkanIds
    resolvedAwIds = resolvedAwIds
  }

  function findMatchScore(agskanName: string, agworldName: string): number {
    const a = agskanName.toLowerCase().trim()
    const b = agworldName.toLowerCase().trim()
    if (a === b) return 100
    if (a.includes(b) || b.includes(a)) return 80
    const aWords = a.split(/[\s_-]+/)
    const bWords = b.split(/[\s_-]+/)
    const matches = aWords.filter(w => bWords.includes(w)).length
    if (matches > 0) return 60 + matches * 10
    return 0
  }

  function backToAccount() {
    view = "account"
  }

  // --- Inspector (review section) ---
  // 5% overlap threshold — fields with less than 5% overlap are ignored
  const OVERLAP_THRESHOLD = 0.05

  // Find fields directly overlapping the clicked field, then check if opposite fields also overlap siblings
  async function findConnectedGroup(id: string, source: "agskan" | "agworld") {
    const turf = await import("@turf/turf")
    const skanIds = new Set<string>()
    const awIds = new Set<string>()

    if (source === "agskan") skanIds.add(id)
    else awIds.add(id)

    // Hop 1: find opposite-side fields that directly overlap the clicked field (>5%)
    const clickedGeom = source === "agskan"
      ? agskanFields.find(f => f.field_id === id)?.boundary
      : agworldBoundaries.find(b => b.field_id === id)?.boundary
    if (!clickedGeom) return { skanIds: Array.from(skanIds), awIds: Array.from(awIds) }

    const oppositeFields = source === "agskan" ? agworldBoundaries : agskanFields
    const directOverlaps: string[] = []
    for (const f of oppositeFields) {
      if (!f.boundary) continue
      const fid = f.field_id || f.id
      // Skip fields that were already resolved (identical/basically/auto-imported/previous review)
      // — including them would create duplicate consolidated entries
      if (source === "agskan" && resolvedAwIds.has(fid)) continue
      if (source === "agworld" && resolvedSkanIds.has(fid)) continue
      const overlapPct = overlapPercentage(turf, clickedGeom, f.boundary)
      if (overlapPct >= OVERLAP_THRESHOLD) {
        directOverlaps.push(fid)
        if (source === "agskan") awIds.add(fid)
        else skanIds.add(fid)
      }
    }

    // Hop 2: for each opposite field found, check if it also overlaps other same-side fields (>5%)
    // This detects splits: SS5 overlaps SS10, SS10 also overlaps Cow Pen → 2 AgSKAN vs 1 Agworld
    for (const oppId of directOverlaps) {
      const oppGeom = source === "agskan"
        ? agworldBoundaries.find(b => b.field_id === oppId)?.boundary
        : agskanFields.find(f => f.field_id === oppId)?.boundary
      if (!oppGeom) continue
      const sameSideFields = source === "agskan" ? agskanFields : agworldBoundaries
      for (const f of sameSideFields) {
        if (!f.boundary) continue
        const fid = f.field_id || f.id
        if (skanIds.has(fid) || awIds.has(fid)) continue
        // Skip already-resolved fields (same reason as hop 1)
        if (source === "agskan" && resolvedSkanIds.has(fid)) continue
        if (source === "agworld" && resolvedAwIds.has(fid)) continue
        const overlapPct = overlapPercentage(turf, oppGeom, f.boundary)
        if (overlapPct >= OVERLAP_THRESHOLD) {
          if (source === "agskan") skanIds.add(fid)
          else awIds.add(fid)
        }
      }
    }

    return { skanIds: Array.from(skanIds), awIds: Array.from(awIds) }
  }

  function overlapPercentage(turf: any, g1: any, g2: any): number {
    if (!g1?.type || !g2?.type) return 0
    try {
      const fc = { type: "FeatureCollection", features: [
        { type: "Feature", geometry: g1, properties: {} },
        { type: "Feature", geometry: g2, properties: {} },
      ] }
      const inter = turf.intersect(fc)
      if (!inter) return 0
      const intersectArea = turf.area(inter)
      const area1 = turf.area({ type: "Feature", geometry: g1, properties: {} })
      const area2 = turf.area({ type: "Feature", geometry: g2, properties: {} })
      if (area1 <= 0 || area2 <= 0) return 0
      // Use the smaller field's area as denominator (directional)
      return Math.min(intersectArea / area1, intersectArea / area2)
    } catch { return 0 }
  }

  async function openInspector(id: string, source: "agskan" | "agworld") {
    const group = await findConnectedGroup(id, source)
    connectedGroup = group

    const skanCount = group.skanIds.length
    const awCount = group.awIds.length

    // Build candidate objects
    const buildSkanCand = (sid: string) => {
      const skan = agskanFields.find(f => f.field_id === sid)
      return { id: sid, name: skan?.name || sid, source: "agskan" as const, overlapPct: 0, areaHa: skan?._turfAreaHa || 0 }
    }
    const buildAwCand = (aid: string) => {
      const awB = agworldBoundaries.find(b => b.field_id === aid)
      const awField = agworldFields.find(f => f.id === aid)
      return { id: aid, name: awField?.attributes?.name || aid, source: "agworld" as const, overlapPct: 0, areaHa: awB?._turfAreaHa || 0 }
    }

    if (skanCount === 1 && awCount === 1) {
      // 1-to-1 match — let user pick boundary and name independently
      proposalType = "match"
      proposalDominant = { id, source }
      const otherId = source === "agskan" ? group.awIds[0] : group.skanIds[0]
      const otherSource = source === "agskan" ? "agworld" : "agskan"
      proposalCandidates = [otherSource === "agskan" ? buildSkanCand(otherId) : buildAwCand(otherId)]
      // Default: clicked field's boundary and name
      boundaryChoice = source
      nameChoice = source
      selectedOverlayIds = [otherId]
    } else if (skanCount > 1 && awCount === 1) {
      // N AgSKAN vs 1 Agworld → default keep AgSKAN side
      proposalType = "split"
      dominantSideChoice = "agskan"
      proposalDominant = { id: group.awIds[0], source: "agworld" }  // the 1 field
      proposalCandidates = group.skanIds.map(buildSkanCand)          // the N fields
      selectedOverlayIds = group.skanIds
      splitFieldNames = proposalCandidates.map(c => c.name)
      dominantFieldIds = group.skanIds
      mapFocus = { id: group.skanIds[0], source: "agskan" }
    } else if (awCount > 1 && skanCount === 1) {
      // 1 AgSKAN vs N Agworld → default keep AgSKAN side
      proposalType = "split"
      dominantSideChoice = "agskan"
      proposalDominant = { id: group.skanIds[0], source: "agskan" } // the 1 field
      proposalCandidates = group.awIds.map(buildAwCand)              // the N fields
      selectedOverlayIds = group.awIds
      splitFieldNames = proposalCandidates.map(c => c.name)
      finalFieldName = agskanFields.find(f => f.field_id === group.skanIds[0])?.name || ""
      dominantFieldIds = [group.skanIds[0]]
      mapFocus = { id: group.skanIds[0], source: "agskan" }
    } else {
      // N vs M → merge with clicked field as dominant
      proposalType = "merge"
      proposalDominant = { id, source }
      dominantFieldIds = [id]
      proposalCandidates = []
      for (const sid of group.skanIds) {
        if (sid === id && source === "agskan") continue
        proposalCandidates.push(buildSkanCand(sid))
      }
      for (const aid of group.awIds) {
        if (aid === id && source === "agworld") continue
        proposalCandidates.push(buildAwCand(aid))
      }
      selectedOverlayIds = proposalCandidates.map(c => c.id)
      const domField = source === "agskan"
        ? agskanFields.find(f => f.field_id === id)
        : agworldFields.find(f => f.id === id)
      finalFieldName = source === "agskan" ? (domField?.name || "") : (domField?.attributes?.name || "")
    }

    mapFocus = proposalDominant
    highlightedCandidate = null

    // Pre-fill names for match
    if (proposalType === "match") {
      const domField = source === "agskan"
        ? agskanFields.find(f => f.field_id === id)
        : agworldFields.find(f => f.id === id)
      finalFieldName = source === "agskan" ? (domField?.name || "") : (domField?.attributes?.name || "")
      splitFieldNames = []
    }
  }

  function closeInspector() {
    connectedGroup = null
    proposalType = null
    proposalDominant = null
    proposalCandidates = []
    mapFocus = null
    highlightedCandidate = null
    selectedOverlayIds = []
    boundaryChoice = "agskan"
    nameChoice = "agskan"
    finalFieldName = ""
    splitFieldNames = []
    dominantSideChoice = "agskan"
    dominantFieldIds = []
  }

  function toggleCandidateSelection(id: string) {
    selectedOverlayIds = selectedOverlayIds.includes(id)
      ? selectedOverlayIds.filter(i => i !== id)
      : [...selectedOverlayIds, id]
    highlightedCandidate = id
  }

  function confirmProposal() {
    if (!proposalType || !proposalDominant) return
    const dom = proposalDominant
    const selectedCands = proposalCandidates.filter(c => selectedOverlayIds.includes(c.id))

    if (proposalType === "match") {
      // 1-to-1: use boundaryChoice and nameChoice independently
      const skanId = dom.source === "agskan" ? dom.id : selectedCands[0]?.id
      const awId = dom.source === "agworld" ? dom.id : selectedCands[0]?.id
      const skanField = agskanFields.find(f => f.field_id === skanId)
      const awB = agworldBoundaries.find(b => b.field_id === awId)
      const awField = agworldFields.find(f => f.id === awId)

      const boundary = boundaryChoice === "agskan" ? skanField?.boundary : awB?.boundary
      const area = boundaryChoice === "agskan" ? (skanField?._turfAreaHa || 0) : (awB?._turfAreaHa || 0)
      const name = finalFieldName || (nameChoice === "agskan" ? (skanField?.name || "") : (awField?.attributes?.name || ""))

      consolidatedFields = [...consolidatedFields, {
        id: crypto.randomUUID(),
        name,
        boundary,
        area_ha: Math.round(area * 10) / 10,
        name_source: nameChoice,
        geometry_source: boundaryChoice,
        category: "merged" as const,
        agskan: { keep: boundaryChoice === "agskan" ? [skanId] : [], create: boundaryChoice === "agworld", delete: [] },
        agworld: { keep: boundaryChoice === "agworld" ? [awId] : [], create: boundaryChoice === "agskan", delete: [] },
      }]

      if (skanId) resolvedSkanIds.add(skanId)
      if (awId) resolvedAwIds.add(awId)
    } else if (proposalType === "merge" || (proposalType === "split" && dominantSideChoice === proposalDominant.source)) {
      // Merge: the 1-field side wins (dominantSideChoice matches proposalDominant.source)
      const domField = dom.source === "agskan"
        ? agskanFields.find(f => f.field_id === dom.id)
        : agworldFields.find(f => f.id === dom.id)
      const domBoundary = dom.source === "agskan"
        ? domField?.boundary
        : agworldBoundaries.find(b => b.field_id === dom.id)?.boundary
      const domArea = dom.source === "agskan"
        ? (domField?._turfAreaHa || 0)
        : (agworldBoundaries.find(b => b.field_id === dom.id)?._turfAreaHa || 0)

      const absorbedSkanIds = selectedCands.filter(c => c.source === "agskan").map(c => c.id)
      const absorbedAwIds = selectedCands.filter(c => c.source === "agworld").map(c => c.id)

      consolidatedFields = [...consolidatedFields, {
        id: crypto.randomUUID(),
        name: finalFieldName || "",
        boundary: domBoundary,
        area_ha: Math.round(domArea * 10) / 10,
        name_source: dom.source,
        geometry_source: dom.source,
        category: "merged" as const,
        agskan: { keep: dom.source === "agskan" ? [dom.id] : [], create: dom.source === "agworld" && absorbedSkanIds.length > 0, delete: dom.source === "agskan" ? [] : absorbedSkanIds },
        agworld: { keep: dom.source === "agworld" ? [dom.id] : [], create: dom.source === "agskan" && absorbedAwIds.length > 0, delete: dom.source === "agworld" ? [] : absorbedAwIds },
      }]

      resolvedSkanIds.add(dom.id)
      resolvedAwIds.add(dom.id)
      for (const id of absorbedSkanIds) resolvedSkanIds.add(id)
      for (const id of absorbedAwIds) resolvedAwIds.add(id)
    } else if (proposalType === "split" && dominantSideChoice !== proposalDominant.source) {
      // Split: the N-field side wins (dominantSideChoice differs from proposalDominant.source)
      // Split: 1→N
      const domDeleteId = dom.id
      const domSource = dom.source

      for (let i = 0; i < selectedCands.length; i++) {
        const cand = selectedCands[i]
        const candField = cand.source === "agskan"
          ? agskanFields.find(f => f.field_id === cand.id)
          : agworldBoundaries.find(b => b.field_id === cand.id)
        const candBoundary = candField?.boundary
        const candArea = cand.areaHa
        const candName = splitFieldNames[proposalCandidates.findIndex(c => c.id === cand.id)] || cand.name
        const shouldDeleteDom = i === 0

        consolidatedFields = [...consolidatedFields, {
          id: crypto.randomUUID(),
          name: candName,
          boundary: candBoundary,
          area_ha: Math.round(candArea * 10) / 10,
          name_source: cand.source,
          geometry_source: cand.source,
          category: "merged" as const,
          agskan: {
            keep: cand.source === "agskan" ? [cand.id] : [],
            create: domSource === "agskan" && shouldDeleteDom,
            delete: domSource === "agskan" && shouldDeleteDom ? [domDeleteId] : [],
          },
          agworld: {
            keep: cand.source === "agworld" ? [cand.id] : [],
            create: domSource === "agworld" && shouldDeleteDom,
            delete: domSource === "agworld" && shouldDeleteDom ? [domDeleteId] : [],
          },
        }]

        if (cand.source === "agskan") resolvedSkanIds.add(cand.id)
        else resolvedAwIds.add(cand.id)
      }
      if (domSource === "agskan") resolvedSkanIds.add(domDeleteId)
      else resolvedAwIds.add(domDeleteId)
    }

    resolvedSkanIds = resolvedSkanIds
    resolvedAwIds = resolvedAwIds
    consolidatedFields = consolidatedFields
    toast.success("Confirmed")

    // Auto-advance
    const nextSkan = reviewSkan.find(f => !resolvedSkanIds.has(f.field_id))
    const nextAw = reviewAw.find(f => !resolvedAwIds.has(f.id))
    if (nextSkan) {
      openInspector(nextSkan.field_id, "agskan")
    } else if (nextAw) {
      openInspector(nextAw.id, "agworld")
    } else {
      closeInspector()
      // Review queue is empty — automatically open the consolidated preview
      toast.success("Review complete! Opening consolidated map...")
      showConsolidatedPreview = true
    }
  }

  // Reactive: filter review lists by resolved ids
  $: {
    reviewSkan = reviewSkan.filter(f => f && !resolvedSkanIds.has(f.field_id))
    reviewAw = reviewAw.filter(f => f && !resolvedAwIds.has(f.id))
  }

  // Auto-open inspector for first unresolved field when entering review section
  let autoOpened = false
  $: if (view === "compare" && !compareLoading && !proposalDominant && !autoOpened && (reviewSkan.length > 0 || reviewAw.length > 0)) {
    autoOpened = true
    const first = reviewSkan[0] || reviewAw[0]
    if (first) {
      const source = first.field_id ? "agskan" : "agworld"
      const id = first.field_id || first.id
      openInspector(id, source)
    }
  }
  // Reset auto-open when leaving compare view
  $: if (view !== "compare") { autoOpened = false }
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

      <!-- Linked AgSKAN customer -->
      <div class="card bg-base-200 mb-6">
        <div class="card-body p-4">
          <h3 class="card-title text-base">
            <Icon icon="solar:link-bold-duotone" width="20" height="20" />
            Linked AgSKAN Customer
          </h3>
          <p class="text-xs opacity-50 -mt-1 mb-1">
            Compare data always uses this specific customer's map, regardless of which account you're logged in as.
          </p>

          {#if selectedAccount.linkedMapId}
            <div class="flex items-center gap-2 bg-success/10 border border-success/20 rounded-lg p-3">
              <Icon icon="solar:check-circle-bold" width="18" height="18" class="text-success" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold truncate">{selectedAccount.linkedProfileLabel || "Linked"}</div>
                <div class="text-xs opacity-50 font-mono truncate">map_id: {selectedAccount.linkedMapId}</div>
              </div>
              <button class="btn btn-ghost btn-xs" on:click={unlinkAccount}>Unlink</button>
            </div>
          {:else}
            <div class="alert alert-warning py-2 mb-2">
              <Icon icon="solar:danger-triangle-bold" width="16" height="16" />
              <span class="text-xs">Not linked — compare will fall back to your own logged-in map.</span>
            </div>
            <div class="flex gap-2">
              <input type="text"
                class="input input-bordered input-sm flex-1"
                placeholder="Search by name or email..."
                bind:value={linkSearchQuery}
                on:keydown={(e) => { if (e.key === 'Enter') searchAgskanProfiles() }} />
              <button class="btn btn-sm" on:click={searchAgskanProfiles} disabled={linkSearching}>
                {#if linkSearching}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon icon="solar:magnifer-linear" width="16" height="16" />{/if}
                Search
              </button>
            </div>
            {#if linkSearchResults.length > 0}
              <div class="mt-2 space-y-1 max-h-[240px] overflow-y-auto">
                {#each linkSearchResults as p (p.id)}
                  <button class="w-full text-left p-2 rounded border border-base-300 hover:bg-base-300/50 flex items-center justify-between gap-2"
                    on:click={() => linkAccountToProfile(p)}>
                    <div class="min-w-0">
                      <div class="text-sm truncate">{p.full_name || "(no name)"}</div>
                      <div class="text-xs opacity-50 truncate">{p.email}</div>
                    </div>
                    {#if p.master_map_id}
                      <span class="badge badge-xs badge-success shrink-0">has map</span>
                    {:else}
                      <span class="badge badge-xs badge-ghost shrink-0">no map</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {:else if linkSearchQuery && !linkSearching}
              <p class="text-xs opacity-40 mt-1">No matches yet — try searching.</p>
            {/if}
          {/if}
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
        {@const totalReview = reviewSkan.length + reviewAw.length}

        <!-- Summary cards -->
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
          <div class="card bg-base-200"><div class="card-body p-1.5 text-center"><div class="text-lg font-bold">{agskanFields.length}</div><div class="text-[11px] opacity-50">AgSKAN</div></div></div>
          <div class="card bg-base-200"><div class="card-body p-1.5 text-center"><div class="text-lg font-bold">{agworldFields.length}</div><div class="text-[11px] opacity-50">Agworld</div></div></div>
          <div class="card bg-success/10"><div class="card-body p-1.5 text-center"><div class="text-lg font-bold text-success">{identicalPairs.length + basicallyIdenticalPairs.length}</div><div class="text-[11px] opacity-50">Matched</div></div></div>
          <div class="card bg-info/10"><div class="card-body p-1.5 text-center"><div class="text-lg font-bold text-info">{autoImportedSkan.length + autoImportedAw.length}</div><div class="text-[11px] opacity-50">Imported</div></div></div>
          <div class="card bg-warning/10"><div class="card-body p-1.5 text-center"><div class="text-lg font-bold text-warning">{totalReview}</div><div class="text-[11px] opacity-50">Review</div></div></div>
          <div class="card bg-primary/10"><div class="card-body p-1.5 text-center"><div class="text-lg font-bold text-primary">{consolidatedFields.length}</div><div class="text-[11px] opacity-50">Consolidated</div></div></div>
        </div>

        <!-- API Logs (collapsed by default) -->
        {#if compareLogs.length > 0}
          <details class="mb-3">
            <summary class="text-xs opacity-40 cursor-pointer hover:opacity-80">
              {compareLogs.length} API calls · {agworldBoundaries.filter(b => b.boundary).length} boundaries loaded
            </summary>
          </details>
        {/if}

        <!-- Resolved automatically: matched (identical + basically identical) & auto-imported, unified -->
        {@const resolvedCombined = [
          ...identicalPairs.map(p => ({ key: 'id-' + p.skan.field_id, name: p.skan.name, area: p.skan._turfAreaHa || p.skan.area || 0, boundary: p.skan.boundary, status: 'matched' })),
          ...basicallyIdenticalPairs.map(p => ({ key: 'bi-' + p.skan.field_id, name: p.skan.name, area: p.skan._turfAreaHa || p.skan.area || 0, boundary: p.skan.boundary, status: 'matched' })),
          ...autoImportedSkan.map(f => ({ key: 'as-' + f.field_id, name: f.name, area: f._turfAreaHa || f.area || 0, boundary: f.boundary, status: 'imported-skan' })),
          ...autoImportedAw.map(awB => {
            const awField = agworldFields.find(f => f.id === awB.field_id)
            return { key: 'aw-' + awB.field_id, name: awField?.attributes?.name || awB.field_id, area: awB._turfAreaHa || awB.area_scalar || 0, boundary: awB.boundary, status: 'imported-agworld' }
          }),
        ].sort((a, b) => a.name.localeCompare(b.name))}

        {#if resolvedCombined.length > 0}
          <details class="mb-3 bg-base-200/40 rounded-lg">
            <summary class="cursor-pointer px-3 py-2 text-sm font-semibold flex items-center gap-2 select-none">
              <Icon icon="solar:check-circle-bold" width="18" height="18" class="text-success shrink-0" />
              <span>{resolvedCombined.length} fields resolved automatically</span>
              <span class="text-xs opacity-50 font-normal">— matched &amp; imported, no action needed</span>
            </summary>
            <div class="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-[260px] overflow-y-auto">
              {#each resolvedCombined as item (item.key)}
                {@const statusStyle = item.status === 'matched'
                  ? { fill: '#22c55e', outline: '#86efac', icon: 'solar:check-circle-bold', text: 'text-success' }
                  : item.status === 'imported-skan'
                  ? { fill: '#0080ff', outline: '#bfffbf', icon: 'solar:arrow-right-bold', text: 'text-info' }
                  : { fill: '#ff8040', outline: '#ffb080', icon: 'solar:arrow-left-bold', text: 'text-warning' }}
                <div class="flex items-center gap-1.5 p-1.5 rounded bg-base-100/60">
                  <FieldOutlineThumbnail boundary={item.boundary} width={28} height={20} fillColor={statusStyle.fill} outlineColor={statusStyle.outline} />
                  <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-mono truncate">{item.name}</div>
                    <div class="text-[10px] opacity-40">{item.area.toFixed(1)} ha</div>
                  </div>
                  <Icon icon={statusStyle.icon} width="12" height="12" class="{statusStyle.text} shrink-0" />
                </div>
              {/each}
            </div>
          </details>
        {/if}

        <!-- SECTION 4: Review — resume banner shown inline when the fullscreen overlay has been dismissed -->
        {#if reviewSkan.length > 0 || reviewAw.length > 0}
          {#if reviewOverlayDismissed}
            <button class="btn btn-warning btn-sm mb-6" on:click={() => reviewOverlayDismissed = false}>
              <Icon icon="solar:danger-triangle-bold" width="16" height="16" />
              Resume review ({reviewSkan.length + reviewAw.length} remaining)
            </button>
          {/if}
        {/if}

        {#if showReviewOverlay}
          <!-- Inspector state compute (shared by sidebar + bottom bar) -->
          {@const domField = proposalDominant?.source === "agskan"
            ? agskanFields.find(f => f.field_id === proposalDominant.id)
            : agworldFields.find(f => f.id === proposalDominant?.id)}
          {@const domBoundary = proposalDominant?.source === "agskan"
            ? domField?.boundary
            : agworldBoundaries.find(b => b.field_id === proposalDominant?.id)?.boundary}
          {@const domName = proposalDominant?.source === "agskan" ? domField?.name : domField?.attributes?.name}
          {@const domArea = proposalDominant?.source === "agskan"
            ? (domField?._turfAreaHa || domField?.area || 0)
            : (agworldBoundaries.find(b => b.field_id === proposalDominant?.id)?._turfAreaHa || 0)}
          {@const skanId = proposalDominant?.source === "agskan" ? proposalDominant.id : proposalCandidates[0]?.id}
          {@const awId = proposalDominant?.source === "agworld" ? proposalDominant.id : proposalCandidates[0]?.id}
          {@const skanField = agskanFields.find(f => f.field_id === skanId)}
          {@const awB = agworldBoundaries.find(b => b.field_id === awId)}
          {@const awField = agworldFields.find(f => f.id === awId)}
          {@const skanName = skanField?.name || ''}
          {@const awName = awField?.attributes?.name || ''}
          {@const skanArea = skanField?._turfAreaHa || 0}
          {@const awArea = awB?._turfAreaHa || 0}
          {@const agskanCount = proposalDominant?.source === "agskan" ? 1 : proposalCandidates.length}
          {@const awCount = proposalDominant?.source === "agworld" ? 1 : proposalCandidates.length}
          {@const skanWins = dominantSideChoice === "agskan"}
          {@const isSplitAction = proposalDominant ? dominantSideChoice !== proposalDominant.source : false}
          {@const bottomBarArea = proposalType === "match" ? (boundaryChoice === "agskan" ? skanArea : awArea) : domArea}
          {@const bottomBarBoundary = proposalType === "match" ? (boundaryChoice === "agskan" ? skanField?.boundary : awB?.boundary) : domBoundary}
          {@const bottomBarNameDup = proposalType && proposalType !== "split" ? findDuplicateField(finalFieldName) : null}

          <ConsolidationShell onBack={() => reviewOverlayDismissed = true} countLabel="{reviewSkan.length + reviewAw.length} remaining" fullscreen={false} height="clamp(380px,60vh,600px)">
            <svelte:fragment slot="sidebar">
              <div class="flex-1 overflow-y-auto p-2">
                {#if !proposalDominant}
                  <div class="p-3 text-center text-neutral-500 text-xs">Loading...</div>
                {:else if proposalType === "match"}
                  <!-- 1-to-1 MATCH: choose which boundary wins -->
                  <div class="text-[9px] sm:text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1.5 px-0.5">Choose boundary</div>
                  <div class="flex flex-col gap-1.5">
                    <button class="p-1.5 sm:p-2 rounded-lg border-2 flex flex-col sm:flex-row items-center gap-1 sm:gap-2 transition-all {boundaryChoice === 'agskan' ? 'border-cyan-500 bg-cyan-900/20' : 'border-neutral-700 hover:border-neutral-500'}"
                      on:click={() => { boundaryChoice = "agskan"; nameChoice = "agskan"; finalFieldName = skanName; mapFocus = { id: skanId, source: "agskan" } }}>
                      <FieldOutlineThumbnail boundary={skanField?.boundary} width={40} height={28} fillColor={boundaryChoice === "agskan" ? "#06b6d4" : "#3a1a0a"} outlineColor={boundaryChoice === "agskan" ? "#fff" : "#f97316"} />
                      <div class="flex-1 min-w-0 text-center sm:text-left">
                        <div class="text-[9px] sm:text-[10px] font-semibold text-neutral-400">AgSKAN</div>
                        <div class="text-[10px] sm:text-[11px] font-mono truncate text-neutral-200">{skanName}</div>
                        <div class="text-[9px] sm:text-[10px] text-neutral-500">{skanArea.toFixed(1)} ha</div>
                      </div>
                      {#if boundaryChoice === "agskan"}<Icon icon="solar:crown-bold" width="14" height="14" class="text-cyan-400 shrink-0" />{/if}
                    </button>
                    <button class="p-1.5 sm:p-2 rounded-lg border-2 flex flex-col sm:flex-row items-center gap-1 sm:gap-2 transition-all {boundaryChoice === 'agworld' ? 'border-cyan-500 bg-cyan-900/20' : 'border-neutral-700 hover:border-neutral-500'}"
                      on:click={() => { boundaryChoice = "agworld"; nameChoice = "agworld"; finalFieldName = awName; mapFocus = { id: awId, source: "agworld" } }}>
                      <FieldOutlineThumbnail boundary={awB?.boundary} width={40} height={28} fillColor={boundaryChoice === "agworld" ? "#06b6d4" : "#3a1a0a"} outlineColor={boundaryChoice === "agworld" ? "#fff" : "#f97316"} />
                      <div class="flex-1 min-w-0 text-center sm:text-left">
                        <div class="text-[9px] sm:text-[10px] font-semibold text-neutral-400">Agworld</div>
                        <div class="text-[10px] sm:text-[11px] font-mono truncate text-neutral-200">{awName}</div>
                        <div class="text-[9px] sm:text-[10px] text-neutral-500">{awArea.toFixed(1)} ha</div>
                      </div>
                      {#if boundaryChoice === "agworld"}<Icon icon="solar:crown-bold" width="14" height="14" class="text-cyan-400 shrink-0" />{/if}
                    </button>
                  </div>
                {:else if proposalType === "split"}
                  <!-- SPLIT / MERGE: choose which side wins, then toggle involved fields -->
                  <div class="text-[9px] sm:text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1.5 px-0.5">Which side wins?</div>
                  <div class="flex flex-col gap-1.5 mb-3">
                    <button class="p-1.5 sm:p-2 rounded-lg border-2 flex items-center justify-between transition-all {skanWins ? 'border-cyan-500 bg-cyan-900/20' : 'border-neutral-700 hover:border-neutral-500'}"
                      on:click={() => {
                        dominantSideChoice = "agskan"
                        dominantFieldIds = proposalDominant.source === "agskan" ? [proposalDominant.id] : proposalCandidates.filter(c => c.source === "agskan").map(c => c.id)
                        mapFocus = proposalDominant.source === "agskan" ? proposalDominant : { id: proposalCandidates.find(c => c.source === "agskan")?.id || proposalCandidates[0].id, source: "agskan" }
                        selectedOverlayIds = [...(proposalDominant.source === "agskan" ? [] : [proposalDominant.id]), ...proposalCandidates.map(c => c.id)]
                      }}>
                      <span class="text-[10px] sm:text-xs font-semibold text-neutral-200">AgSKAN</span>
                      <span class="text-[9px] sm:text-[10px] text-neutral-400">{agskanCount} kept</span>
                    </button>
                    <button class="p-1.5 sm:p-2 rounded-lg border-2 flex items-center justify-between transition-all {!skanWins ? 'border-cyan-500 bg-cyan-900/20' : 'border-neutral-700 hover:border-neutral-500'}"
                      on:click={() => {
                        dominantSideChoice = "agworld"
                        dominantFieldIds = proposalDominant.source === "agworld" ? [proposalDominant.id] : proposalCandidates.filter(c => c.source === "agworld").map(c => c.id)
                        mapFocus = proposalDominant.source === "agworld" ? proposalDominant : { id: proposalCandidates.find(c => c.source === "agworld")?.id || proposalCandidates[0].id, source: "agworld" }
                        selectedOverlayIds = [...(proposalDominant.source === "agworld" ? [] : [proposalDominant.id]), ...proposalCandidates.map(c => c.id)]
                      }}>
                      <span class="text-[10px] sm:text-xs font-semibold text-neutral-200">Agworld</span>
                      <span class="text-[9px] sm:text-[10px] text-neutral-400">{awCount} kept</span>
                    </button>
                  </div>
                  <div class="text-[9px] sm:text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1.5 px-0.5">
                    {isSplitAction ? 'Resulting fields' : 'Fields to absorb'}
                  </div>
                  <div class="flex flex-col gap-1">
                    {#each proposalCandidates as cand, ci (cand.id + '-' + ci)}
                      {@const candBoundary = cand.source === "agskan" ? (agskanFields.find(f => f.field_id === cand.id)?.boundary) : (agworldBoundaries.find(b => b.field_id === cand.id)?.boundary)}
                      {@const isSelected = selectedOverlayIds.includes(cand.id)}
                      <button class="w-full text-left p-1.5 rounded flex flex-col sm:flex-row items-center gap-1 sm:gap-2 {isSelected ? 'bg-cyan-900/40 ring-1 ring-cyan-500' : 'hover:bg-neutral-800 opacity-50'}"
                        on:click={() => toggleCandidateSelection(cand.id)}>
                        <FieldOutlineThumbnail boundary={candBoundary} width={32} height={22} fillColor={isSplitAction ? "#06b6d4" : "#3a1a0a"} outlineColor={isSplitAction ? "#fff" : "#f97316"} />
                        <div class="flex-1 min-w-0 text-center sm:text-left">
                          <div class="text-[10px] sm:text-[11px] font-mono truncate text-neutral-200">{cand.name}</div>
                          <div class="text-[9px] sm:text-[10px] text-neutral-500">{cand.areaHa.toFixed(1)} ha</div>
                        </div>
                        {#if isSelected}<Icon icon="solar:check-circle-bold" width="14" height="14" class="text-cyan-400 shrink-0" />{/if}
                      </button>
                    {/each}
                  </div>
                {:else}
                  <!-- MERGE (N→1) -->
                  <div class="text-[9px] sm:text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1.5 px-0.5">Kept field</div>
                  <div class="p-1.5 sm:p-2 rounded-lg border-2 border-cyan-500 bg-cyan-900/20 flex flex-col sm:flex-row items-center gap-1 sm:gap-2 mb-3">
                    <FieldOutlineThumbnail boundary={domBoundary} width={40} height={28} fillColor="#06b6d4" outlineColor="#fff" />
                    <div class="flex-1 min-w-0 text-center sm:text-left">
                      <div class="text-[9px] sm:text-[10px] font-semibold text-neutral-400">{proposalDominant.source === "agskan" ? "AgSKAN" : "Agworld"}</div>
                      <div class="text-[10px] sm:text-[11px] font-mono truncate text-neutral-200">{domName}</div>
                      <div class="text-[9px] sm:text-[10px] text-neutral-500">{domArea.toFixed(1)} ha</div>
                    </div>
                  </div>
                  <div class="text-[9px] sm:text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1.5 px-0.5">Fields to absorb</div>
                  <div class="flex flex-col gap-1">
                    {#each proposalCandidates as cand, ci (cand.id + '-' + ci)}
                      {@const candBoundary = cand.source === "agskan" ? (agskanFields.find(f => f.field_id === cand.id)?.boundary) : (agworldBoundaries.find(b => b.field_id === cand.id)?.boundary)}
                      {@const isSelected = selectedOverlayIds.includes(cand.id)}
                      <button class="w-full text-left p-1.5 rounded flex flex-col sm:flex-row items-center gap-1 sm:gap-2 {isSelected ? 'bg-cyan-900/40 ring-1 ring-cyan-500' : 'hover:bg-neutral-800 opacity-50'}"
                        on:click={() => toggleCandidateSelection(cand.id)}>
                        <FieldOutlineThumbnail boundary={candBoundary} width={32} height={22} fillColor="#3a1a0a" outlineColor="#f97316" />
                        <div class="flex-1 min-w-0 text-center sm:text-left">
                          <div class="text-[10px] sm:text-[11px] font-mono truncate text-neutral-200">{cand.name}</div>
                          <div class="text-[9px] sm:text-[10px] text-neutral-500">{cand.areaHa.toFixed(1)} ha</div>
                        </div>
                        {#if isSelected}<Icon icon="solar:check-circle-bold" width="14" height="14" class="text-cyan-400 shrink-0" />{/if}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </svelte:fragment>

            <svelte:fragment slot="map">
              <ConsolidationMap
                {agskanFields}
                {agworldBoundaries}
                focusField={mapFocus}
                highlightFieldId={highlightedCandidate}
                selectedFieldIds={selectedOverlayIds}
                dominantFieldIds={dominantFieldIds}
                fadedFocus={isSplitAction}
                height="100%"
                inspectorMode={true}
              />
            </svelte:fragment>

            <svelte:fragment slot="bottombar">
              {#if proposalType === "split" && isSplitAction}
                <div class="max-w-2xl mx-auto px-4 py-2 max-h-[140px] overflow-y-auto space-y-1.5">
                    {#if selectedOverlayIds.length > 0}
                      {#each proposalCandidates as cand, ci (cand.id + '-' + ci)}
                        {#if selectedOverlayIds.includes(cand.id)}
                          {@const isDup = findDuplicateField(splitFieldNames[ci])}
                          {@const candBoundary = cand.source === "agskan" ? (agskanFields.find(f => f.field_id === cand.id)?.boundary) : (agworldBoundaries.find(b => b.field_id === cand.id)?.boundary)}
                          <div>
                            <div class="flex items-center gap-1.5 min-w-0">
                              <FieldOutlineThumbnail boundary={candBoundary} width={28} height={20} fillColor="#06b6d4" outlineColor="#fff" />
                              <input type="text" class="input input-xs input-bordered flex-1 min-w-0 font-mono text-neutral-100 bg-neutral-800 {isDup ? 'border-red-500' : 'border-neutral-600'}" bind:value={splitFieldNames[ci]} placeholder={cand.name} />
                            </div>
                            {#if isDup}<div class="text-[10px] text-red-400 mt-0.5">Name already used elsewhere</div>{/if}
                          </div>
                        {/if}
                      {/each}
                    {:else}
                      <div class="text-xs text-neutral-500 text-center py-1">Select fields in sidebar</div>
                    {/if}
                  </div>
                  <div class="max-w-2xl mx-auto px-4 pb-3 sm:pb-4">
                    <button class="btn btn-sm btn-success w-full whitespace-nowrap" disabled={selectedOverlayIds.length === 0} on:click={confirmProposal}>
                      <Icon icon="solar:check-circle-bold" width="14" height="14" class="shrink-0" />
                      <span class="hidden sm:inline">Confirm split &amp; next</span>
                      <span class="sm:hidden">Confirm split</span>
                    </button>
                  </div>
                {:else if proposalType}
                  <div class="max-w-2xl mx-auto px-4 py-3 sm:py-4">
                    <div class="flex items-center gap-2 mb-1 min-w-0">
                      <FieldOutlineThumbnail boundary={bottomBarBoundary} width={36} height={26} fillColor="#06b6d4" outlineColor="#fff" />
                      <input type="text" class="input input-sm input-bordered flex-1 min-w-0 font-mono text-neutral-100 bg-neutral-800 {bottomBarNameDup ? 'border-red-500' : 'border-neutral-600'}" bind:value={finalFieldName} placeholder="Field name" />
                      <span class="text-xs text-neutral-400 font-mono shrink-0 whitespace-nowrap">{bottomBarArea.toFixed(1)} ha</span>
                    </div>
                    {#if bottomBarNameDup}
                      <div class="text-[10px] text-red-400 mb-1.5">Name already used by another field</div>
                    {/if}
                    <button class="btn btn-sm btn-success w-full whitespace-nowrap" disabled={proposalType !== "match" && selectedOverlayIds.length === 0} on:click={confirmProposal}>
                      <Icon icon="solar:check-circle-bold" width="14" height="14" class="shrink-0" />
                      <span class="hidden sm:inline">Confirm &amp; next</span>
                      <span class="sm:hidden">Confirm</span>
                    </button>
                  </div>
                {/if}
            </svelte:fragment>
          </ConsolidationShell>
        {/if}

        <!-- Consolidated output (collapsible) -->
        {#if consolidatedFields.length > 0}
          <details class="mb-6">
            <summary class="text-lg font-semibold cursor-pointer mb-3">
              <Icon icon="solar:document-add-bold" width="20" height="20" class="inline mr-1 text-primary" />
              Consolidated Package
              <span class="text-sm opacity-50 ml-2">({consolidatedFields.length} fields)</span>
            </summary>
            <div class="overflow-auto max-h-[400px]">
              <table class="table table-xs">
                <thead>
                  <tr><th>Name</th><th>Area</th><th>Category</th><th>Name src</th><th>Geom src</th><th>AgSKAN</th><th>Agworld</th></tr>
                </thead>
                <tbody>
                  {#each consolidatedFields as cf (cf.id)}
                    <tr>
                      <td class="font-mono">{cf.name}</td>
                      <td>{cf.area_ha.toFixed(1)} ha</td>
                      <td><span class="badge badge-xs badge-outline">{cf.category}</span></td>
                      <td>{cf.name_source}</td>
                      <td>{cf.geometry_source}</td>
                      <td class="text-xs">
                        {#if cf.agskan.keep.length}keep: {cf.agskan.keep.join(', ')}{/if}
                        {#if cf.agskan.create}<span class="text-success">create</span>{/if}
                        {#if cf.agskan.delete.length}<span class="text-error">del: {cf.agskan.delete.join(', ')}</span>{/if}
                      </td>
                      <td class="text-xs">
                        {#if cf.agworld.keep.length}keep: {cf.agworld.keep.join(', ')}{/if}
                        {#if cf.agworld.create}<span class="text-success">create</span>{/if}
                        {#if cf.agworld.delete.length}<span class="text-error">del: {cf.agworld.delete.join(', ')}</span>{/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
          <button class="btn btn-sm btn-outline mb-6" on:click={() => showConsolidatedPreview = true}>
            <Icon icon="solar:map-point-bold" width="14" height="14" class="mr-1" /> View Fullscreen Map
          </button>
        {/if}

        <!-- Empty state -->
        {#if identicalPairs.length === 0 && basicallyIdenticalPairs.length === 0 && autoImportedSkan.length === 0 && autoImportedAw.length === 0 && reviewSkan.length === 0 && reviewAw.length === 0 && consolidatedFields.length === 0}
          <div class="card bg-base-200 mb-6">
            <div class="card-body p-6 text-center">
              <Icon icon="solar:map-point-bold" width="40" height="40" class="opacity-20 mx-auto mb-3" />
              <p class="opacity-50">No fields to display.</p>
              <p class="text-xs opacity-30 mt-1">{agskanFields.length} AgSKAN · {agworldFields.length} Agworld</p>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Fullscreen consolidated preview overlay -->
  {#if showConsolidatedPreview}
    {@const sortedFields = [...consolidatedFields].sort((a, b) => a.name.localeCompare(b.name))}
    {@const previewField = sortedFields.find(f => f.id === selectedPreviewId)}
    {@const duplicateIds = new Set(sortedFields.filter(f => findDuplicateField(f.name, f.id)).map(f => f.id))}
    {@const filteredFields = previewSearchQuery.trim() ? sortedFields.filter(f => f.name.toLowerCase().includes(previewSearchQuery.trim().toLowerCase())) : sortedFields}
    {@const reviewFields = filteredFields.filter(f => duplicateIds.has(f.id))}
    {@const restFields = filteredFields.filter(f => !duplicateIds.has(f.id))}
    <ConsolidationShell onBack={() => showConsolidatedPreview = false} countLabel="{sortedFields.length} fields">
      <svelte:fragment slot="sidebar">
        <!-- Search bar, stickied to top -->
        <div class="p-1.5 border-b border-neutral-700 sticky top-0 bg-neutral-900 z-10">
          <div class="relative">
            <Icon icon="solar:magnifer-linear" width="12" height="12" class="absolute left-1.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input type="text" placeholder="Search"
              class="input input-xs w-full pl-5 bg-neutral-800 border-neutral-600 text-neutral-200 text-[10px] sm:text-[11px]"
              bind:value={previewSearchQuery} />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {#if reviewFields.length > 0}
            <div class="text-[9px] sm:text-[10px] font-semibold text-red-400 uppercase tracking-wide px-1 pt-0.5 pb-0.5 flex items-center gap-1">
              <Icon icon="solar:danger-triangle-bold" width="10" height="10" /> Needs review
            </div>
            {#each reviewFields as f (f.id)}
              {@const isSelected = selectedPreviewId === f.id}
              <button
                class="text-left p-1.5 rounded flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-1.5 w-full {isSelected ? 'bg-cyan-900/30 ring-1 ring-cyan-700/50' : 'hover:bg-neutral-800'}"
                on:click={() => {
                  selectedPreviewId = f.id
                  editingPreviewName = f.name
                  editingPreviewArea = Math.round(f.area_ha * 10) / 10
                }}>
                <div class="relative shrink-0">
                  <FieldOutlineThumbnail boundary={f.boundary} width={32} height={22} fillColor={isSelected ? '#06b6d4' : '#64748b'} outlineColor={isSelected ? '#67e8f9' : '#94a3b8'} />
                  <Icon icon="solar:danger-triangle-bold" width="11" height="11" class="absolute -top-1 -right-1 text-red-400 bg-neutral-900 rounded-full" />
                </div>
                <div class="flex-1 min-w-0 text-center sm:text-left">
                  <div class="text-[10px] sm:text-[11px] leading-tight font-mono truncate {isSelected ? 'text-cyan-300' : 'text-red-300'}">{f.name}</div>
                  <div class="text-[9px] sm:text-[10px] text-neutral-500">{f.area_ha.toFixed(1)} ha</div>
                </div>
              </button>
            {/each}
            <div class="border-t border-neutral-700 my-1"></div>
          {/if}
          {#each restFields as f (f.id)}
            {@const isSelected = selectedPreviewId === f.id}
            <button
              class="text-left p-1.5 rounded flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-1.5 w-full {isSelected ? 'bg-cyan-900/30 ring-1 ring-cyan-700/50' : 'hover:bg-neutral-800'}"
              on:click={() => {
                selectedPreviewId = f.id
                editingPreviewName = f.name
                editingPreviewArea = Math.round(f.area_ha * 10) / 10
              }}>
              <FieldOutlineThumbnail boundary={f.boundary} width={32} height={22} fillColor={isSelected ? '#06b6d4' : '#64748b'} outlineColor={isSelected ? '#67e8f9' : '#94a3b8'} />
              <div class="flex-1 min-w-0 text-center sm:text-left">
                <div class="text-[10px] sm:text-[11px] leading-tight font-mono truncate {isSelected ? 'text-cyan-300' : 'text-neutral-300'}">{f.name}</div>
                <div class="text-[9px] sm:text-[10px] text-neutral-500">{f.area_ha.toFixed(1)} ha</div>
              </div>
            </button>
          {/each}
          {#if filteredFields.length === 0}
            <div class="text-[10px] text-neutral-500 text-center py-3">No fields match</div>
          {/if}
        </div>
      </svelte:fragment>

      <svelte:fragment slot="map">
        <ConsolidationMap
          agskanFields={sortedFields.map(f => ({ field_id: f.id, name: f.name, boundary: f.boundary, _turfAreaHa: f.area_ha }))}
          agworldBoundaries={[]}
          focusField={null}
          highlightFieldId={null}
          selectedFieldIds={[]}
          dominantFieldIds={[]}
          selectedConsolidatedId={selectedPreviewId}
          height="100%"
          interactive={true}
          on:selectField={(e) => {
            const id = e.detail.id
            selectedPreviewId = id
            const field = sortedFields.find(f => f.id === id)
            if (field) { editingPreviewName = field.name; editingPreviewArea = field.area_ha }
          }}
        />
      </svelte:fragment>

      <svelte:fragment slot="bottombar">
        {#if previewField}
          {@const duplicateField = editingPreviewName ? findDuplicateField(editingPreviewName, selectedPreviewId) : null}
          <div class="max-w-2xl mx-auto px-4 py-3 sm:py-4">
              <div class="flex items-center gap-3">
                <!-- Thumbnail -->
                <FieldOutlineThumbnail boundary={previewField.boundary} width={48} height={48} fillColor="#0080ff" outlineColor="#bfffbf" />

                <div class="flex-1 min-w-0">
                  <label class="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold block mb-1">Field name</label>
                  <input type="text"
                    bind:this={previewNameInputEl}
                    class="input input-sm sm:input-md input-bordered w-full font-mono text-neutral-100 bg-neutral-800 {duplicateField ? 'border-red-500 focus:border-red-500' : 'border-neutral-600'}"
                    placeholder="Field name"
                    bind:value={editingPreviewName}
                    on:keydown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitPreviewName()
                        previewAreaInputEl?.focus()
                        previewAreaInputEl?.select()
                      }
                    }}
                    on:change={commitPreviewName} />
                </div>

                <div class="shrink-0">
                  <label class="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold block mb-1 text-right">Area (ha)</label>
                  <input type="number" step="0.1" min="0"
                    bind:this={previewAreaInputEl}
                    class="input input-sm sm:input-md input-bordered w-[80px] font-mono text-neutral-100 bg-neutral-800 border-neutral-600 text-right"
                    bind:value={editingPreviewArea}
                    on:input={() => { editingPreviewArea = Math.round(editingPreviewArea * 10) / 10 }}
                    on:keydown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitPreviewArea()
                        advanceToNextPreviewField()
                      }
                    }}
                    on:change={commitPreviewArea} />
                </div>

                <!-- Delete button -->
                <div class="shrink-0 flex flex-col justify-end">
                  <button class="btn btn-sm btn-ghost text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    on:click={deletePreviewField}
                    title="Delete this field from the consolidated package">
                    <Icon icon="solar:trash-bin-trash-bold" width="16" height="16" />
                  </button>
                </div>
              </div>

              <div class="flex items-center justify-between mt-2 min-h-[16px]">
                {#if duplicateField}
                  <button class="text-[11px] text-red-400 flex items-center gap-1 hover:text-red-300"
                    on:click={() => {
                      selectedPreviewId = duplicateField.id
                      editingPreviewName = duplicateField.name
                      editingPreviewArea = Math.round(duplicateField.area_ha * 10) / 10
                    }}>
                    <Icon icon="solar:danger-triangle-bold" width="12" height="12" />
                    Name already used by another field — view it
                  </button>
                {:else}
                  <span class="text-[11px] text-neutral-500">
                    Using {previewField.name_source === 'agskan' ? 'AgSKAN' : 'Agworld'} name · {previewField.geometry_source === 'agskan' ? 'AgSKAN' : 'Agworld'} boundary
                  </span>
                {/if}
                {#if savedFlash}
                  <span class="text-[11px] text-green-400 flex items-center gap-1" transition:fade={{ duration: 200 }}>
                    <Icon icon="solar:check-circle-bold" width="12" height="12" /> Saved
                  </span>
                {/if}
              </div>
            </div>
        {/if}
      </svelte:fragment>
    </ConsolidationShell>
  {/if}
</div>
