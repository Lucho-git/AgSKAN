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
  import FieldTrailOverlay from "$lib/components/map/trails/FieldTrailOverlay.svelte"
  import FieldOutlineThumbnail from "$lib/components/map/FieldOutlineThumbnail.svelte"
  import {
    agworldAccountStore,
    agworldApiV2,
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
  async function selectAccount(id: string) {
    recordsLoading = true
    selectedAccountId = id
    view = "account"
    accountTab = "records"
    apiResult = null; apiError = null; apiStatus = null
    requestLogs = []; expandedLogId = null
    expandedFarms = new Set(); expandedFields = new Set()
    expandedActivityFields = new Set(); fieldActivityData = new Map()
    selectedYear = 2026; selectedFieldId = null; recordSearchQuery = ""
    const acct = accounts.find((a) => a.id === id)
    queryGrowerId = acct?.growerId || ""
    linkSearchQuery = ""; linkSearchResults = []
    try {
      await Promise.all([
        loadAgworldFieldCounts(id),
        loadAgworldFieldList(id),
        loadAgworldRecords(id),
        loadTrailProgress(),
        loadAgworldActivitiesFromDb(id),
      ])
    } catch (e: any) {
      console.error("selectAccount load failed:", e.message)
      recordsError = e.message
      recordsLoading = false
    }
  }

  // --- Link Agworld account to a specific AgSKAN customer's map ---
  let linkSearchQuery = ""
  let linkSearchResults: Array<{ id: string; email: string; full_name: string; master_map_id: string | null }> = []
  let linkSearching = false
  let accountTab: "explorer" | "records" = "explorer"

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
  let savingConsolidated = false
  let saveResults: { created: number; updated: number; deleted: number; errors: string[] } | null = null

  // Save consolidation metadata to the Agworld account (localStorage), NOT the actual AgSKAN fields.
  // This preserves the consolidation plan for review without modifying the customer's real map data.
  function saveConsolidationMetadata() {
    if (!selectedAccount) return
    const key = `agskan_agworld_consolidation_${selectedAccount.id}`
    localStorage.setItem(key, JSON.stringify({
      savedAt: new Date().toISOString(),
      accountName: selectedAccount.name,
      linkedMapId: selectedAccount.linkedMapId,
      linkedProfileLabel: selectedAccount.linkedProfileLabel,
      fields: consolidatedFields,
      agworldBoundaries: agworldBoundaries,
      agworldFields: agworldFields,
    }))
    toast.success(`Consolidation package saved (${consolidatedFields.length} fields)`)
  }

  function loadConsolidationMetadata(): boolean {
    if (!selectedAccount) return false
    const key = `agskan_agworld_consolidation_${selectedAccount.id}`
    const raw = localStorage.getItem(key)
    if (!raw) return false
    try {
      const data = JSON.parse(raw)
      if (data.fields && Array.isArray(data.fields) && data.fields.length > 0) {
        consolidatedFields = data.fields
        if (data.agworldBoundaries) agworldBoundaries = data.agworldBoundaries
        if (data.agworldFields) agworldFields = data.agworldFields
        return true
      }
    } catch { }
    return false
  }

  function hasSavedConsolidation(): boolean {
    if (!selectedAccount) return false
    const key = `agskan_agworld_consolidation_${selectedAccount.id}`
    return !!localStorage.getItem(key)
  }

  // --- Agworld Records ---
  let agworldRecordView: "list" | "match" = "list"
  let agworldRecords: any[] = []
  let agworldFieldList: any[] = []
  let selectedYear: number | null = 2026
  let showMap = false
  let overlayField: any = null
  let overlayRecords: any[] = []
  let selectedFieldId: string | null = null
  let recordsLoading = false
  let recordsError: string | null = null
  let agworldFieldCount = 0

  // Records tab UI state
  let recordSearchQuery = ""
  let expandedFarms = new Set<string>()
  let expandedFields = new Set<string>()

  // Agworld Activity Data (fetched per-field from Agworld API)
  let fieldActivityLoading = new Set<string>()
  let fieldActivityData = new Map<string, { actuals: any[]; workOrders: any[]; plans: any[]; error?: string }>()
  let expandedActivityFields = new Set<string>()
  let syncProgress = ""

  // Activity modal
  let activityModal: { id: string; type: string; resource: any } | null = null
  let activityModalData: { operations: any[]; products: any[]; operatorUsers: any[]; assets: any[]; weatherRecords: any[]; areaHa: number | null; loading: boolean; error?: string } | null = null

  // Grouped by farm → field for records display
  $: filteredFieldList = selectedYear
    ? agworldFieldList.filter(f => f.production_year === selectedYear)
    : agworldFieldList

  $: farmGroups = (() => {
    const groups: Record<string, { name: string; fields: any[]; totalHa: number }> = {}
    for (const f of filteredFieldList) {
      const key = f.farm_name || 'No Farm'
      if (!groups[key]) groups[key] = { name: key, fields: [], totalHa: 0 }
      groups[key].fields.push(f)
      groups[key].totalHa += f.area || 0
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name))
  })()

  function toggleFarmExpand(name: string) {
    const expanding = !expandedFarms.has(name)
    if (expanding) {
      expandedFarms.add(name)
      // Auto-expand all fields (records + activities) within this farm
      const farmFields = agworldFieldList.filter(f => (f.farm_name || 'No Farm') === name)
      for (const f of farmFields) {
        expandedFields.add(f.id)
        if (fieldActivityData.has(f.id)) expandedActivityFields.add(f.id)
      }
    } else {
      expandedFarms.delete(name)
      // Collapse all fields (records + activities) within this farm
      const farmFields = agworldFieldList.filter(f => (f.farm_name || 'No Farm') === name)
      for (const f of farmFields) {
        expandedFields.delete(f.id)
        expandedActivityFields.delete(f.id)
      }
    }
    expandedFarms = new Set(expandedFarms)
    expandedFields = new Set(expandedFields)
    expandedActivityFields = new Set(expandedActivityFields)
  }

  function toggleFieldExpand(id: string) {
    const expanding = !expandedFields.has(id)
    if (expanding) {
      expandedFields.add(id)
      // Auto-expand farm and activities too
      const field = agworldFieldList.find(f => f.id === id)
      if (field && !expandedFarms.has(field.farm_name || 'No Farm')) {
        toggleFarmExpand(field.farm_name || 'No Farm')
      }
      if (fieldActivityData.has(id)) {
        expandedActivityFields.add(id)
        expandedActivityFields = new Set(expandedActivityFields)
      }
    } else {
      expandedFields.delete(id)
      expandedActivityFields.delete(id)
      expandedActivityFields = new Set(expandedActivityFields)
    }
    expandedFields = new Set(expandedFields)
  }

  function toggleActivityExpand(fieldId: string) {
    if (expandedActivityFields.has(fieldId)) {
      expandedActivityFields.delete(fieldId)
    } else {
      expandedActivityFields.add(fieldId)
    }
    expandedActivityFields = new Set(expandedActivityFields)
  }

  async function openActivityModal(activityId: string, resource: any) {
    if (!selectedAccount || !selectedAccount.growerId) return
    const type = resource.type === 'actuals' ? 'Actual' : resource.type === 'work-orders' ? 'Work Order' : 'Plan'
    activityModal = { id: activityId, type, resource }
    activityModalData = { operations: [], products: [], operatorUsers: [], assets: [], weatherRecords: [], areaHa: null, loading: true }

    console.log(`[Modal] Opening for ${type} "${resource.attributes?.name}" (${activityId})`)
    try {
      const [opsRes, prodsRes, usersRes, assetsRes, weatherRes, fieldsRes] = await Promise.all([
        agworldApiV3.listActivityOperations(selectedAccount, selectedAccount.growerId, { filter: { activity_id: activityId }, page: { size: 10 } }),
        agworldApiV3.listActivityProductApplications(selectedAccount, selectedAccount.growerId, { filter: { activity_id: activityId }, page: { size: 20 } }),
        agworldApiV3.listActivityOperatorUsers(selectedAccount, selectedAccount.growerId, { filter: { activity_id: activityId } }),
        agworldApiV3.listActivityAssets(selectedAccount, selectedAccount.growerId, { filter: { activity_id: activityId } }),
        agworldApiV3.listActivityWeatherRecords(selectedAccount, selectedAccount.growerId, { filter: { activity_id: activityId } }),
        agworldApiV3.listActivityFields(selectedAccount, selectedAccount.growerId, { filter: { activity_id: activityId } }),
      ])

      console.log(`[Modal] Results — ops:${opsRes.success ? opsRes.data?.data?.length ?? 0 : 'FAIL'} prods:${prodsRes.success ? prodsRes.data?.data?.length ?? 0 : 'FAIL'} users:${usersRes.success ? usersRes.data?.data?.length ?? 0 : 'FAIL'} assets:${assetsRes.success ? assetsRes.data?.data?.length ?? 0 : 'FAIL'} weather:${weatherRes.success ? weatherRes.data?.data?.length ?? 0 : 'FAIL'} fields:${fieldsRes.success ? fieldsRes.data?.data?.length ?? 0 : 'FAIL'}`)

      const errors: string[] = []
      if (!opsRes.success) errors.push(`ops:${opsRes.status} ${opsRes.error}`)
      if (!prodsRes.success) errors.push(`prods:${prodsRes.status} ${prodsRes.error}`)
      if (!usersRes.success) errors.push(`users:${usersRes.status} ${usersRes.error}`)
      if (!assetsRes.success) errors.push(`assets:${assetsRes.status} ${assetsRes.error}`)
      if (!weatherRes.success) errors.push(`weather:${weatherRes.status} ${weatherRes.error}`)
      if (!fieldsRes.success) errors.push(`fields:${fieldsRes.status} ${fieldsRes.error}`)

      const ops = (opsRes.data?.data || []) as any[]
      const products = (prodsRes.data?.data || []) as any[]
      const users = (usersRes.data?.data || []) as any[]
      const assets = (assetsRes.data?.data || []) as any[]
      const weather = (weatherRes.data?.data || []) as any[]
      const fields = (fieldsRes.data?.data || []) as any[]

      // Dump raw responses for debugging
      console.log(`[Modal] RAW products (${products.length}):`, JSON.parse(JSON.stringify(products)))
      console.log(`[Modal] RAW operations (${ops.length}):`, JSON.parse(JSON.stringify(ops)))
      if (users.length) console.log(`[Modal] RAW users:`, JSON.parse(JSON.stringify(users)))
      if (assets.length) console.log(`[Modal] RAW assets:`, JSON.parse(JSON.stringify(assets)))
      if (weather.length) console.log(`[Modal] RAW weather:`, JSON.parse(JSON.stringify(weather)))
      if (fields.length) console.log(`[Modal] RAW fields (${fields.length}):`, JSON.parse(JSON.stringify(fields)))

      let areaHa: number | null = null
      if (fields.length > 0) {
        areaHa = fields.reduce((sum: number, f: any) => sum + ((f.attributes?.area?.scalar || f.attributes?.area || 0) as number), 0)
      }

      activityModalData = {
        operations: ops,
        products,
        operatorUsers: users,
        assets,
        weatherRecords: weather,
        areaHa,
        loading: false,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      }
    } catch (e: any) {
      console.error(`[Modal] Exception:`, e.message || e)
      activityModalData = { operations: [], products: [], operatorUsers: [], assets: [], weatherRecords: [], areaHa: null, loading: false, error: e.message }
    }
  }

  function closeActivityModal() {
    activityModal = null
    activityModalData = null
    closeSurf()
  }

  // Relationship navigation — per-card breadcrumb surfing
  let surfCardId: string | null = null
  let surfStack: { label: string; data: any; loading: boolean; error?: string }[] = []

  function startSurf(cardId: string, resource: any) {
    surfCardId = cardId
    const name = resource.attributes?.name || resource.id?.substring(0,12)
    const type = (resource.type || '').replace(/^activity-/,'')
    surfStack = [{ label: `${type}:${name}`, data: resource, loading: false }]
  }

  async function fetchRelationship(resource: any, relName: string) {
    if (!selectedAccount?.growerId) return
    const rel = resource.relationships?.[relName]
    if (!rel?.data) return
    const target = Array.isArray(rel.data) ? rel.data[0] : rel.data
    if (!target?.id) return

    const label = `${relName}: ${target.type?.replace(/^activity-/,'')}:${target.id.substring(0,12)}`
    surfStack = [...surfStack, { label, data: null, loading: true }]

    try {
      const path = target.type === 'growers' ? `/api/v3/growers/${target.id}`
        : target.type === 'products' ? `/api/v3/products/${target.id}`
        : target.type === 'operations' ? `/api/v3/operations/${target.id}`
        : target.type === 'users' ? `/api/v3/users/${target.id}`
        : target.type === 'actuals' ? `/api/v3/growers/${selectedAccount.growerId}/actuals/${target.id}`
        : target.type === 'plans' ? `/api/v3/growers/${selectedAccount.growerId}/plans/${target.id}`
        : target.type === 'work-orders' ? `/api/v3/growers/${selectedAccount.growerId}/work-orders/${target.id}`
        : target.type === 'recommendations' ? `/api/v3/growers/${selectedAccount.growerId}/recommendations/${target.id}`
        : `/api/v3/${target.type}/${target.id}`

      const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV
      let url: string
      if (isDev) {
        url = `/agworld-v3-proxy/${selectedAccount.instance}${path}`
      } else {
        const base = (AGWORLD_INSTANCES[selectedAccount.instance] || AGWORLD_INSTANCES.au).base
        url = `${base}${path}`
      }

      const resp = await fetch(url, {
        headers: { 'Authorization': `API-Key ${selectedAccount.apiKey}`, 'Accept': 'application/vnd.api+json' }
      })
      const json = await resp.json()
      const prev = surfStack.slice(0, -1)
      surfStack = [...prev, { label, data: json.data || json, loading: false, error: resp.ok ? undefined : `HTTP ${resp.status}` }]
    } catch (e: any) {
      const prev = surfStack.slice(0, -1)
      surfStack = [...prev, { label, data: null, loading: false, error: e.message }]
    }
  }

  function closeSurf() {
    surfCardId = null
    surfStack = []
  }

  function surfBackTo(index: number) {
    surfStack = surfStack.slice(0, index + 1)
  }

  // Merge plans + actuals into a unified timeline.
  // Agworld links plans→actuals via parent_id (filter[parent_id]=PLN-ID on the actuals endpoint),
  // but actuals don't expose parent_id in their attributes. Name matching is the reliable
  // client-side approach and produces identical results for all observed data.
  function getMergedTimeline(activity: { actuals: any[]; workOrders: any[]; plans: any[]; _convertedActualIds?: Set<string> }) {
    const getName = (r: any) => ((r.attributes?.name || r.attributes?.operation_type_name || '') as string).trim().toLowerCase()

    const actuals = [...(activity.actuals || [])]
    const plans = [...(activity.plans || [])]
    const workOrders = activity.workOrders || []
    const convertedIds = activity._convertedActualIds || new Set<string>()

    const convertedPairs: { plan: any; actual: any }[] = []
    const discardedConvertedPairs: { plan: any; actual: any }[] = []
    const unmatchedActuals: any[] = []
    const matchedPlanIds = new Set<string>()

    if (convertedIds.size > 0) {
      // Parent_id confirmed: actuals in this set were created from plans.
      // Match ALL plans including discarded — if parent_id links a discarded plan
      // to an actual, the work happened despite the plan being marked discarded.
      for (const plan of plans) {
        const planName = getName(plan)
        if (!planName) continue
        const matchingActual = actuals.find(a =>
          convertedIds.has(a.id) && getName(a) === planName
        )
        if (matchingActual) {
          if (plan.attributes?.status === 'closed_discarded') {
            discardedConvertedPairs.push({ plan, actual: matchingActual })
          } else {
            convertedPairs.push({ plan, actual: matchingActual })
          }
          matchedPlanIds.add(plan.id)
        }
      }
    } else {
      // No parent_id data (loaded from DB cache) — fall back to name matching
      const matchedActualIds = new Set<string>()
      for (const plan of plans) {
        const status = plan.attributes?.status
        if (status === 'closed_discarded') continue  // can't confirm link without parent_id
        const planName = getName(plan)
        if (!planName) continue
        const matchingActual = actuals.find(a =>
          getName(a) === planName && !matchedActualIds.has(a.id)
        )
        if (matchingActual) {
          convertedPairs.push({ plan, actual: matchingActual })
          matchedPlanIds.add(plan.id)
          matchedActualIds.add(matchingActual.id)
        }
      }
    }

    const matchedActualIds = new Set(convertedPairs.map(p => p.actual.id))
    for (const a of actuals) {
      if (!matchedActualIds.has(a.id)) unmatchedActuals.push(a)
    }

    const allPending = plans.filter(p => !matchedPlanIds.has(p.id))
    const discardedPlans = allPending.filter(p => p.attributes?.status === 'closed_discarded')
    const pendingPlans = allPending.filter(p => p.attributes?.status !== 'closed_discarded')

    // Sort by date — oldest first
    const sortDate = (r: any) => r.attributes?.completed_at || r.attributes?.due_at || r.attributes?.started_at || ''

    return {
      convertedPairs: convertedPairs.sort((a, b) => sortDate(a.actual).localeCompare(sortDate(b.actual))),
      discardedConvertedPairs: discardedConvertedPairs.sort((a, b) => sortDate(a.actual).localeCompare(sortDate(b.actual))),
      unmatchedActuals: unmatchedActuals.sort((a, b) => sortDate(a).localeCompare(sortDate(b))),
      pendingPlans: pendingPlans.sort((a, b) => sortDate(a).localeCompare(sortDate(b))),
      discardedPlans: discardedPlans.sort((a, b) => sortDate(a).localeCompare(sortDate(b))),
      workOrders: workOrders.sort((a, b) => (a.attributes?.due_date || '').localeCompare(b.attributes?.due_date || '')),
    }
  }

  // Load cached activities from DB (called on account select)
  async function loadAgworldActivitiesFromDb(accountId?: string) {
    const acctId = accountId || selectedAccount?.id
    if (!acctId) return
    try {
      const { data } = await supabase
        .from("agworld_activities")
        .select("*")
        .eq("account_id", acctId)
        .order("completed_at", { ascending: false })

      // Group by field_boundary_id → then map to our field IDs
      const byBoundary = new Map<string, any[]>()
      for (const row of (data || [])) {
        const key = row.field_boundary_id || row.field_id
        if (!byBoundary.has(key)) byBoundary.set(key, [])
        byBoundary.get(key)!.push(row)
      }

      const newMap = new Map<string, { actuals: any[]; workOrders: any[]; plans: any[]; error?: string }>()
      for (const field of agworldFieldList) {
        const boundaryId = field.properties?.agworld_boundary_id || field.agworld_field_ref
        const activities = byBoundary.get(boundaryId) || []
        if (activities.length > 0) {
          newMap.set(field.id, {
            actuals: activities.filter(a => a.agworld_type === 'actual').map(a => a.data),
            workOrders: activities.filter(a => a.agworld_type === 'work_order').map(a => a.data),
            plans: activities.filter(a => a.agworld_type === 'plan').map(a => a.data),
          })
        }
      }
      fieldActivityData = newMap
      // Auto-expand activity sections for all fields that have cached data
      expandedActivityFields = new Set(newMap.keys())
      console.log(`[AgActivity] Loaded ${data?.length || 0} cached activities from DB across ${newMap.size} fields`)
    } catch (e: any) {
      console.error("loadAgworldActivitiesFromDb failed:", e.message)
    }
  }

  // Upsert fetched activity items into the DB
  async function saveActivitiesToDb(field: any, items: { type: string; resource: any }[]) {
    if (!selectedAccount || items.length === 0) return
    const boundaryId = field.properties?.agworld_boundary_id || field.agworld_field_ref
    const rows = items.map(item => {
      const attrs = item.resource.attributes || {}
      return {
        account_id: selectedAccount!.id,
        agworld_id: item.resource.id,
        agworld_type: item.type,
        field_boundary_id: boundaryId,
        field_id: field.agworld_field_ref,
        data: item.resource,
        status: attrs.status || null,
        name: attrs.name || attrs.operation_type_name || null,
        started_at: attrs.started_at || null,
        completed_at: attrs.completed_at || null,
        due_date: attrs.due_date || null,
        planned_date: attrs.due_at || null,
        updated_at_agworld: attrs.updated_at || null,
      }
    })
    const { error } = await supabase.from("agworld_activities")
      .upsert(rows, { onConflict: "account_id,agworld_id,agworld_type", ignoreDuplicates: false })
    if (error) console.warn("[AgActivity] DB upsert error:", error.message)

    // Update last sync timestamp on the field
    await supabase.from("agworld_fields")
      .update({ last_activity_sync_at: new Date().toISOString() })
      .eq("id", field.id)
  }

  async function fetchFieldActivity(field: any) {
    if (!selectedAccount || !selectedAccount.growerId) {
      toast.error("Set a Grower ID on this account first")
      return
    }
    // Use the field boundary ID (properties.agworld_boundary_id), not the field ID (agworld_field_ref).
    // The Agworld API filters actuals/plans/work-orders by field_boundary_id, which is the boundary resource.
    const boundaryId = field.properties?.agworld_boundary_id || field.agworld_field_ref
    if (!boundaryId) {
      toast.error("No Agworld boundary reference for this field")
      return
    }

    // Already loading
    if (fieldActivityLoading.has(field.id)) return
    // Already synced — just toggle visibility, no need to re-fetch
    const existing = fieldActivityData.get(field.id)
    if (existing && !existing.error) {
      toggleActivityExpand(field.id)
      return
    }

    fieldActivityLoading.add(field.id)
    fieldActivityLoading = new Set(fieldActivityLoading)

    console.log(`[AgActivity] Fetching for field "${field.name}" (boundaryId: ${boundaryId}, fieldId: ${field.agworld_field_ref}, grower: ${selectedAccount.growerId})`)
    try {
      const startTime = performance.now()

      // Fetch each endpoint individually so one failure doesn't block others
      let actualsRes: any = { success: false, error: 'not called', status: 0, data: null }
      let workOrdersRes: any = { success: false, error: 'not called', status: 0, data: null }
      let plansRes: any = { success: false, error: 'not called', status: 0, data: null }

      try {
        actualsRes = await agworldApiV3.listActualsByField(selectedAccount, selectedAccount.growerId, boundaryId, { page: { size: 50 }, sort: '-completed_at' })
      } catch (e: any) { actualsRes = { success: false, error: e.message || 'exception', status: 0, data: null } }

      try {
        workOrdersRes = await agworldApiV3.listWorkOrdersByField(selectedAccount, selectedAccount.growerId, boundaryId, { page: { size: 50 }, sort: '-updated_at' })
      } catch (e: any) { workOrdersRes = { success: false, error: e.message || 'exception', status: 0, data: null } }

      try {
        plansRes = await agworldApiV3.listPlansByField(selectedAccount, selectedAccount.growerId, boundaryId, { page: { size: 50 }, sort: '-updated_at' })
      } catch (e: any) { plansRes = { success: false, error: e.message || 'exception', status: 0, data: null } }

      const elapsed = Math.round(performance.now() - startTime)

      // Detailed logging
      console.log(`[AgActivity] "${field.name}" results:`)
      console.log(`  actuals:    success=${actualsRes.success} status=${actualsRes.status} count=${actualsRes.data?.data?.length ?? 0} error=${actualsRes.error || 'none'}`)
      console.log(`  workOrders: success=${workOrdersRes.success} status=${workOrdersRes.status} count=${workOrdersRes.data?.data?.length ?? 0} error=${workOrdersRes.error || 'none'}`)
      console.log(`  plans:      success=${plansRes.success} status=${plansRes.status} count=${plansRes.data?.data?.length ?? 0} error=${plansRes.error || 'none'}`)
      console.log(`  duration: ${elapsed}ms`)

      // Log response bodies if any call failed
      if (!actualsRes.success) console.warn(`[AgActivity] Actuals FAILED — response:`, actualsRes)
      if (!workOrdersRes.success) console.warn(`[AgActivity] WorkOrders FAILED — response:`, workOrdersRes)
      if (!plansRes.success) console.warn(`[AgActivity] Plans FAILED — response:`, plansRes)

      const actuals = actualsRes.data?.data || []
      const workOrders = workOrdersRes.data?.data || []
      const plans = plansRes.data?.data || []

      // After fetching plans, resolve plan→actual links via parent_id for converted plans
      let convertedActuals: any[] = []
      const convertedPlanIds = plans.filter((p: any) => {
        const s = p.attributes?.status
        return s === 'closed_fully' || s === 'closed_partially'
      }).map((p: any) => p.id)

      if (convertedPlanIds.length > 0) {
        try {
          const parentFilter = convertedPlanIds.join(',')
          const parentRes = await agworldApiV3.listActualsByField(selectedAccount, selectedAccount.growerId, boundaryId, {
            page: { size: 50 },
            filter: { parent_id: parentFilter },
          })
          convertedActuals = parentRes.data?.data || []
          console.log(`[AgActivity] "${field.name}" parent_id query — ${convertedActuals.length} converted actuals from ${convertedPlanIds.length} plans`)
          if (!parentRes.success) console.warn(`[AgActivity] parent_id query FAILED:`, parentRes.error)
        } catch (e: any) {
          console.warn(`[AgActivity] parent_id query exception:`, e.message)
        }
      }

      // Identify which actuals are converted (matched by parent_id) vs standalone
      const convertedActualIds = new Set(convertedActuals.map((a: any) => a.id))
      const standaloneActuals = actuals.filter((a: any) => !convertedActualIds.has(a.id))

      const errors: string[] = []
      if (!actualsRes.success) errors.push(`Actuals: ${actualsRes.error}`)
      if (!workOrdersRes.success) errors.push(`Work Orders: ${workOrdersRes.error}`)
      if (!plansRes.success) errors.push(`Plans: ${plansRes.error}`)

      if (actualsRes.success || workOrdersRes.success || plansRes.success) {
        const allItems = [
          ...actuals.map((r: any) => ({ type: 'actual', resource: r })),
          ...workOrders.map((r: any) => ({ type: 'work_order', resource: r })),
          ...plans.map((r: any) => ({ type: 'plan', resource: r })),
        ]
        await saveActivitiesToDb(field, allItems)
      }

      fieldActivityData.set(field.id, {
        actuals,
        workOrders,
        plans,
        _convertedActualIds: convertedActualIds,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      })
      fieldActivityData = new Map(fieldActivityData)

      if (errors.length > 0) {
        toast.warning(`Partial data: ${errors.join('; ')}`)
      } else {
        const total = actuals.length + workOrders.length + plans.length
        toast.success(`Synced ${total} activity items`)
      }
      toggleActivityExpand(field.id)
    } catch (e: any) {
      // Keep existing DB data on failure
      console.error(`[AgActivity] "${field.name}" fetch exception:`, e.message || e)
      toast.error(`Failed: ${e.message}`)
    } finally {
      fieldActivityLoading.delete(field.id)
      fieldActivityLoading = new Set(fieldActivityLoading)
    }
  }

  async function syncAllActivity() {
    const fields = agworldFieldList.filter(f => f.properties?.agworld_boundary_id || f.agworld_field_ref)
    if (fields.length === 0) {
      toast.info("No fields to sync")
      return
    }
    syncProgress = `Syncing ${fields.length} fields...`
    let synced = 0; let failed = 0; let totalItems = 0
    const BATCH = 3
    for (let i = 0; i < fields.length; i += BATCH) {
      const batch = fields.slice(i, i + BATCH)
      syncProgress = `Syncing ${synced}/${fields.length} fields...`
      
      const results = await Promise.allSettled(batch.map(async (f) => {
        if (!selectedAccount || !selectedAccount.growerId) return
        const boundaryId = f.properties?.agworld_boundary_id || f.agworld_field_ref
        if (!boundaryId) return
        
        try {
          // Fetch individually so one failure doesn't block others
          let actualsRes: any = { success: false, error: 'not called', status: 0, data: null }
          try {
            actualsRes = await agworldApiV3.listActualsByField(selectedAccount, selectedAccount.growerId, boundaryId, { page: { size: 50 }, sort: '-completed_at' })
          } catch (e: any) { actualsRes = { success: false, error: e.message, status: 0, data: null } }

          let workOrdersRes: any = { success: false, data: null }
          try { workOrdersRes = await agworldApiV3.listWorkOrdersByField(selectedAccount, selectedAccount.growerId, boundaryId, { page: { size: 50 }, sort: '-updated_at' }) } catch (e: any) { workOrdersRes = { success: false, error: e.message, data: null } }

          let plansRes: any = { success: false, data: null }
          try { plansRes = await agworldApiV3.listPlansByField(selectedAccount, selectedAccount.growerId, boundaryId, { page: { size: 50 }, sort: '-updated_at' }) } catch (e: any) { plansRes = { success: false, error: e.message, data: null } }

          const actuals = actualsRes.data?.data || []
          const workOrders = workOrdersRes.data?.data || []
          const plans = plansRes.data?.data || []

          // Resolve plan→actual via parent_id
          let convertedActualIds = new Set<string>()
          const convertedPlanIds = plans.filter((p: any) => {
            const s = p.attributes?.status
            return s === 'closed_fully' || s === 'closed_partially'
          }).map((p: any) => p.id)

          if (convertedPlanIds.length > 0) {
            try {
              const parentRes = await agworldApiV3.listActualsByField(selectedAccount, selectedAccount.growerId, boundaryId, {
                page: { size: 50 },
                filter: { parent_id: convertedPlanIds.join(',') },
              })
              const convertedActuals = parentRes.data?.data || []
              convertedActualIds = new Set(convertedActuals.map((a: any) => a.id))
            } catch { /* non-critical */ }
          }

          const allItems = [
            ...actuals.map((r: any) => ({ type: 'actual', resource: r })),
            ...workOrders.map((r: any) => ({ type: 'work_order', resource: r })),
            ...plans.map((r: any) => ({ type: 'plan', resource: r })),
          ]

          if (actualsRes.success || workOrdersRes.success || plansRes.success) {
            await saveActivitiesToDb(f, allItems)
          }

          fieldActivityData.set(f.id, { actuals, workOrders, plans, _convertedActualIds: convertedActualIds })
          fieldActivityData = new Map(fieldActivityData)
          
          return allItems.length
        } catch { return null }
      }))
      
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value !== null && r.value !== undefined) {
          synced++
          totalItems += r.value
        } else { failed++ }
      }
      
      if (i + BATCH < fields.length) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
    
    syncProgress = ""
    // Auto-expand all synced fields so data is immediately visible
    expandedActivityFields = new Set(fieldActivityData.keys())
    if (failed > 0) {
      toast.warning(`Synced ${totalItems} items across ${synced} fields · ${failed} failed`)
    } else {
      toast.success(`Synced ${totalItems} activity items across ${synced} fields`)
    }
  }

  async function loadAgworldFieldList(accountId?: string) {
    const acctId = accountId || selectedAccount?.id
    if (!acctId) return
    try {
      const { data } = await supabase
        .from("agworld_fields")
        .select("id, name, agworld_field_name, agworld_field_ref, area, boundary, farm_id, farm_name, crop_type, production_year, properties, last_activity_sync_at")
        .eq("account_id", acctId)
        .order("name")
      agworldFieldList = data || []
    } catch (e: any) {
      console.error("loadAgworldFieldList failed:", e.message)
      agworldFieldList = []
    }
  }

  function openFieldOverlay(field: any) {
    if (!field?.boundary) return
    overlayField = field
    overlayRecords = agworldRecords.filter(r => r.agworld_field_id === field.id)
    showMap = true
  }

  async function loadAgworldRecords(accountId?: string) {
    const acctId = accountId || selectedAccount?.id
    if (!acctId) return
    recordsLoading = true
    recordsError = null
    try {
      const { data, error } = await supabase
        .from("agworld_records")
        .select("*")
        .eq("account_id", acctId)
        .order("start_time", { ascending: false })
        .limit(200)
      if (error) { recordsError = error.message; return }
      agworldRecords = data || []
    } catch (e: any) {
      recordsError = e.message
    } finally {
      recordsLoading = false
    }
  }

  async function importAllAgworldFields() {
    if (!selectedAccount || !selectedAccount.linkedMapId) {
      toast.error("Link this account to an AgSKAN customer first")
      return
    }
    if (!selectedAccount.growerId) {
      toast.error("Set a Grower ID on this account first")
      return
    }
    savingConsolidated = true
    try {
      // Step 1: Fetch all pages of boundaries, fields, farms, and crops
      const PAGE = 100
      let allBoundaryRefs: any[] = []
      let allFields: any[] = []
      let allCrops: any[] = []
      let page = 1
      let pageErrors: string[] = []

      // Fetch all boundary pages
      while (true) {
        const fbResult = await agworldApiV3.listFieldBoundaries(selectedAccount, selectedAccount.growerId, { page: { number: page, size: PAGE } })
        const refs = fbResult.data?.data || []
        allBoundaryRefs.push(...refs)
        if (!fbResult.success) pageErrors.push(`Boundaries p${page}: ${fbResult.status} ${fbResult.error || ''}`)
        if (refs.length < PAGE) break
        page++
        await new Promise(r => setTimeout(r, 200))
      }

      // Fetch all field pages
      page = 1
      while (true) {
        const fdResult = await agworldApiV3.listFields(selectedAccount, selectedAccount.growerId, { page: { number: page, size: PAGE } })
        const refs = fdResult.data?.data || []
        allFields.push(...refs)
        if (!fdResult.success) pageErrors.push(`Fields p${page}: ${fdResult.status} ${fdResult.error || ''}`)
        if (refs.length < PAGE) break
        page++
        await new Promise(r => setTimeout(r, 200))
      }

      console.log(`PAGINATION: ${allBoundaryRefs.length} boundaries, ${allFields.length} fields, ${allCrops.length} crops${pageErrors.length ? ' — ERRORS: ' + pageErrors.join('; ') : ''}`)

      // Farms & crops — paginate crops too
      const fwResult = await agworldApiV3.listFarms(selectedAccount, selectedAccount.growerId, { page: { size: 50 } })

      allCrops = []
      page = 1
      while (true) {
        const fcResult = await agworldApiV3.listFieldCrops(selectedAccount, selectedAccount.growerId, { page: { number: page, size: PAGE } })
        const refs = fcResult.data?.data || []
        allCrops.push(...refs)
        if (!fcResult.success) pageErrors.push(`Crops p${page}: ${fcResult.status} ${fcResult.error || ''}`)
        if (refs.length < PAGE) break
        page++
        await new Promise(r => setTimeout(r, 200))
      }

      const boundaryRefs = allBoundaryRefs
      if (boundaryRefs.length === 0) {
        toast.warning(`No boundaries found`)
        return
      }

      const awFields = allFields

      // Build lookups
      const fieldNameMap = new Map<string, string>()
      const fieldFarmMap = new Map<string, string>()
      for (const f of awFields) {
        fieldNameMap.set(f.id, f.attributes?.name || f.id)
        const farmId = f.relationships?.farm?.data?.id
        if (farmId) fieldFarmMap.set(f.id, farmId)
      }

      const farms = fwResult.data?.data || []
      const farmNameMap = new Map<string, string>()
      for (const f of farms) farmNameMap.set(f.id, f.attributes?.name || f.id)

      const crops = allCrops
      const fieldCropMap = new Map<string, string>()
      for (const c of crops) {
        const fid = c.relationships?.field?.data?.id
        if (!fid) continue
        const cropName = c.attributes?.crop_type?.name || ''
        if (!cropName) continue
        const existing = fieldCropMap.get(fid)
        const updated = c.attributes?.updated_at || ''
        if (!existing || updated > ((c as any)._sortKey || '')) {
          (c as any)._sortKey = updated
          fieldCropMap.set(fid, cropName)
        }
      }

      // Fetch crop variety names
      const varietyIds = [...new Set(crops.map(c => c.relationships?.crop_variety?.data?.id).filter(Boolean))] as string[]
      const varietyNameMap = new Map<string, string>()
      for (let i = 0; i < varietyIds.length; i += 2) {
        const batch = varietyIds.slice(i, i + 2)
        const results = await Promise.all(batch.map(vid =>
          agworldApiV2.getCropVariety(selectedAccount, vid).catch(() => null)
        ))
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          if (r?.success && r.data?.data) {
            varietyNameMap.set(batch[j], r.data.data.attributes?.name || '')
          }
        }
        if (i + 2 < varietyIds.length) await new Promise(r => setTimeout(r, 200))
      }

      // Update crop map: "Wheat" → "Wheat - Ninja"
      for (const c of crops) {
        const fid = c.relationships?.field?.data?.id
        const vid = c.relationships?.crop_variety?.data?.id
        if (!fid || !vid) continue
        const varName = varietyNameMap.get(vid)
        if (varName && fieldCropMap.has(fid)) {
          const baseName = fieldCropMap.get(fid)!.replace(/ - .*$/, '')
          fieldCropMap.set(fid, `${baseName} - ${varName}`)
        }
      }

      // Filter to 2026 only
      const refs2026 = boundaryRefs.filter(b => b.attributes?.production_year === 2026)
      if (refs2026.length === 0) {
        toast.warning("No 2026 boundaries found — trying all years")
        refs2026.push(...boundaryRefs)
      }

      toast.info(`Fetching geometry for ${refs2026.length} boundaries (${awFields.length} fields, 2026)...`)

      // Step 2: Fetch geometry — keep one boundary per field (2026 only)
      const sorted = [...refs2026].sort((a, b) => {
        const yDiff = (b.attributes?.production_year || 0) - (a.attributes?.production_year || 0)
        if (yDiff !== 0) return yDiff
        return (b.attributes?.updated_at || '').localeCompare(a.attributes?.updated_at || '')
      })
      const seen = new Set<string>()
      const toFetch = sorted.filter(b => {
        const fid = b.relationships?.field?.data?.id
        const year = b.attributes?.production_year || 0
        const key = `${fid}_${year}`
        if (!fid || seen.has(key)) return false
        seen.add(key)
        return true
      })

      toast.info(`Fetching geometry for ${toFetch.length} fields (${boundaryRefs.length} boundaries total)...`)

      // Rate limit: 200/min → 4 concurrent per 1200ms ≈ 200/min
      let imported = 0
      let skipped = 0
      let failed = 0
      let batchDelay = 1200
      const errorSamples: any[] = []
      const errorCounts: Record<string, number> = {}
      for (let i = 0; i < toFetch.length; i += 4) {
        const batch = toFetch.slice(i, i + 4)
        const results = await Promise.all(batch.map(b =>
          agworldApiV3.getFieldBoundary(selectedAccount, selectedAccount.growerId, b.id)
        ))

        let batchHad429 = false
        for (let j = 0; j < results.length; j++) {
          const res = results[j]
          if (res.status === 429) { batchHad429 = true }
          if (!res.success) {
            failed++
            const key = `${res.status || '??'}: ${res.error || 'unknown'}`
            errorCounts[key] = (errorCounts[key] || 0) + 1
            if (errorSamples.length < 3) {
              errorSamples.push({ boundaryId: batch[j].id, status: res.status, error: res.error, fieldId: batch[j].relationships?.field?.data?.id })
            }
            continue
          }
          const d = res.data?.data
          if (!d) { failed++; continue }

          const attrs = d.attributes || {}
          const geom = attrs.boundary
          if (!geom) { skipped++; continue }

          const fieldId = d.relationships?.field?.data?.id || batch[j].relationships?.field?.data?.id
          const name = fieldNameMap.get(fieldId) || attrs.name || `Field ${batch[j].id?.substring(0, 8)}`
          const farmId = fieldFarmMap.get(fieldId) || ''
          const farmName = farmNameMap.get(farmId) || ''
          const crop = fieldCropMap.get(fieldId) || ''

          let areaHa = attrs.area?.scalar || 0
          if (!areaHa && geom) {
            try {
              const turf = await import("@turf/turf")
              areaHa = Math.round(turf.area({ type: "Feature", geometry: geom, properties: {} }) / 10000 * 100) / 100
            } catch { }
          }

          const cleanGeom = { ...geom }
          delete cleanGeom.crs

          const prodYear = batch[j].attributes?.production_year || attrs.production_year || null

          // Store raw agworld data for full detail view
          const rawProperties = {
            agworld_boundary_id: batch[j].id,
            production_year: prodYear,
            from_date: batch[j].attributes?.from_date || attrs.from_date,
            to_date: batch[j].attributes?.to_date || attrs.to_date,
            updated_at: attrs.updated_at,
            area_raw: attrs.area,
            crop_type: crop || null,
            farm_name: farmName || null,
          }

          const { error } = await supabase.from("agworld_fields").upsert({
            account_id: selectedAccount.id,
            agworld_field_name: name,
            agworld_field_ref: fieldId,
            name,
            area: areaHa,
            boundary: cleanGeom,
            map_id: selectedAccount.linkedMapId,
            farm_id: farmId || null,
            farm_name: farmName || null,
            crop_type: crop || null,
            production_year: prodYear,
            properties: rawProperties,
            geometry_source: "agworld",
            category: "imported",
          }, { onConflict: "account_id,agworld_field_ref,production_year", ignoreDuplicates: false })
          if (!error) imported++
        }

        if (i + 4 < toFetch.length) {
          await new Promise(r => setTimeout(r, batchHad429 ? batchDelay * 2 : batchDelay))
        }
      }

      if (failed > 0) {
        console.log(`GEOMETRY FETCH ERRORS: ${failed} failed, ${skipped} no geometry`, { samples: errorSamples, counts: errorCounts })
      }
      toast.success(`Imported ${imported} fields${failed ? ` (${failed} failed, ${skipped} no geometry — see console)` : ''}`)
      await loadAgworldFieldCounts()
      await loadAgworldFieldList()
    } catch (e: any) {
      toast.error(`Import failed: ${e.message}`)
    } finally {
      savingConsolidated = false
    }
  }

  async function deduplicateOverlappingFields() {
    if (!selectedAccount) return
    const { data: fields } = await supabase
      .from("agworld_fields")
      .select("id, name, area, boundary, farm_id, farm_name")
      .eq("account_id", selectedAccount.id)
      .not("boundary", "is", null)
    if (!fields || fields.length < 2) return

    const turf = await import("@turf/turf")
    const byFarm = new Map<string, typeof fields>()
    for (const f of fields) {
      const key = f.farm_id || "_nofarm"
      if (!byFarm.has(key)) byFarm.set(key, [])
      byFarm.get(key)!.push(f)
    }

    let removed = 0
    for (const [, farmFields] of byFarm) {
      if (farmFields.length < 2) continue
      const toDelete = new Set<string>()

      for (let i = 0; i < farmFields.length; i++) {
        if (toDelete.has(farmFields[i].id)) continue
        const a = farmFields[i]
        let aGeom = a.boundary
        if (aGeom?.type === "Feature") aGeom = aGeom.geometry
        if (!aGeom) continue

        for (let j = i + 1; j < farmFields.length; j++) {
          if (toDelete.has(farmFields[j].id)) continue
          const b = farmFields[j]
          let bGeom = b.boundary
          if (bGeom?.type === "Feature") bGeom = bGeom.geometry
          if (!bGeom) continue

          try {
            const inter = turf.intersect(turf.featureCollection([
              { type: "Feature", geometry: aGeom, properties: {} },
              { type: "Feature", geometry: bGeom, properties: {} },
            ]))
            if (!inter) continue

            const interArea = turf.area(inter)
            const smallerArea = Math.min(a.area || 1, b.area || 1) * 10000 // ha → m²
            const overlapPct = (interArea / smallerArea) * 100

            if (overlapPct > 80) {
              // Keep the one with larger area, delete the smaller
              const loser = (a.area || 0) >= (b.area || 0) ? b : a
              toDelete.add(loser.id)
            }
          } catch { }
        }
      }

      for (const id of toDelete) {
        await supabase.from("agworld_fields").delete().eq("id", id)
        removed++
      }
    }

    if (removed > 0) console.log(`DEDUP: removed ${removed} overlapping fields`)
  }

  async function matchSprayToAgworld() {
    if (!selectedAccount || !selectedAccount.linkedMapId) {
      toast.error("Link this account to an AgSKAN customer first")
      return
    }

    recordsLoading = true
    recordsError = null
    console.log("[Match] Starting spray→agworld match, map:", selectedAccount.linkedMapId)
    try {
      const { data: awFields, error: awErr } = await supabase
        .from("agworld_fields")
        .select("id, name, agworld_field_name, boundary")
        .eq("account_id", selectedAccount.id)

      if (awErr) { recordsError = awErr.message; console.error("[Match] Error loading agworld fields:", awErr.message); return }
      if (!awFields || awFields.length === 0) {
        console.warn("[Match] No agworld fields imported")
        toast.warning("No agworld fields imported yet — click 'Import Agworld Fields' first")
        return
      }
      console.log(`[Match] Loaded ${awFields.length} agworld fields`)

      const { data: sprayRecs, error: srErr } = await supabase
        .from("spray_records")
        .select("*")
        .eq("master_map_id", selectedAccount.linkedMapId)
        .order("start_time", { ascending: false })
        .limit(500)

      if (srErr) { recordsError = srErr.message; console.error("[Match] Error loading spray records:", srErr.message); return }
      if (!sprayRecs || sprayRecs.length === 0) {
        console.warn(`[Match] No spray records found for map ${selectedAccount.linkedMapId}. Generate them first via /account/records → Backfill.`)
        toast.warning("No spray records found for this map")
        return
      }
      console.log(`[Match] Loaded ${sprayRecs.length} spray records`)

      const turf = await import("@turf/turf")
      const awPolys = awFields.map(f => {
        let geom = f.boundary
        if (geom?.type === "Feature") geom = geom.geometry
        return { ...f, geom }
      }).filter(f => f.geom?.type === "Polygon" || f.geom?.type === "MultiPolygon")

      let matched = 0, noGeom = 0, noMatch = 0
      await supabase.from("agworld_records").delete().eq("account_id", selectedAccount.id)

      for (const sr of sprayRecs) {
        if (!sr.field_path) { noGeom++; continue }
        let trailGeom = sr.field_path
        if (trailGeom.type === "Feature") trailGeom = trailGeom.geometry
        let pt: any = null
        try {
          const feat = { type: "Feature", geometry: trailGeom, properties: {} }
          delete (feat.geometry as any).crs
          pt = turf.centroid(feat)
        } catch { noGeom++; continue }
        if (!pt?.geometry) { noGeom++; continue }

        let best: typeof awPolys[0] | null = null
        for (const aw of awPolys) {
          try {
            const awFeat = { type: "Feature", geometry: aw.geom, properties: {} }
            delete (awFeat.geometry as any).crs
            if (turf.booleanPointInPolygon(pt.geometry.coordinates, awFeat)) { best = aw; break }
          } catch { }
        }
        if (!best) { noMatch++; continue }

        const { error: upErr } = await supabase.from("agworld_records").upsert({
          account_id: selectedAccount.id,
          agworld_field_id: best.id,
          agworld_field_name: best.name || best.agworld_field_name,
          agworld_boundary: best.boundary,
          master_map_id: selectedAccount.linkedMapId,
          trail_id: sr.trail_id, operation_id: sr.operation_id,
          vehicle_id: sr.vehicle_id, operator_name: sr.operator_name,
          field_path: sr.field_path, area_hectares: sr.area_hectares,
          distance_km: sr.distance_km, start_time: sr.start_time,
          end_time: sr.end_time, duration_seconds: sr.duration_seconds,
          activity_type: sr.activity_type, chem_mix: sr.chem_mix,
          weather_data: sr.weather_data, swath_width: sr.swath_width,
          field_id: sr.field_id, operator_id: sr.operator_id,
          trail_width: sr.trail_width, trail_color: sr.trail_color,
          vehicle_type: sr.vehicle_type, vehicle_marker: sr.vehicle_marker,
          gen_pct_of_field: sr.gen_pct_of_field,
          gen_pct_of_trail: sr.gen_pct_of_trail,
          gen_method: "spatial_centroid", status: "matched",
        }, { onConflict: "trail_id,agworld_field_id", ignoreDuplicates: false })
        if (!upErr) { matched++ }
        else if (matched < 3) {
          console.log("MATCH UPSERT ERROR:", { error: upErr.message, code: (upErr as any).code, trailId: sr.trail_id, fieldId: best.id })
        }
      }

      console.log(`MATCH DONE: ${matched} matched, ${noMatch} no field, ${noGeom} no geometry`)
      if (matched > 0 && matched < 3) {
        const sample = agworldRecords.slice(0, 1)
        console.log("SAMPLE MATCHED RECORD:", sample[0] ? { id: sample[0].id, field_path_type: sample[0].field_path?.type, has_boundary: !!sample[0].agworld_boundary } : 'none')
      }
      toast.success(`Matched ${matched} of ${sprayRecs.length} spray records (${noMatch} no field, ${noGeom} no geometry)`)
      await loadAgworldRecords()
    } catch (e: any) {
      recordsError = e.message
    } finally {
      recordsLoading = false
    }
  }

  let genTrailLimit = 100
  let genProgress = ""
  let trailProgress = { total: 0, processed: 0, oldest_processed: null as string | null }

  async function loadTrailProgress() {
    if (!selectedAccount?.linkedMapId) { trailProgress = { total: 0, processed: 0, oldest_processed: null }; return }
    try {
      const { data } = await supabase.rpc("get_agworld_trail_progress", {
        p_master_map_id: selectedAccount.linkedMapId,
        p_account_id: selectedAccount.id
      })
      trailProgress = data || { total: 0, processed: 0, oldest_processed: null }
    } catch { trailProgress = { total: 0, processed: 0, oldest_processed: null } }
  }

  async function generateAgworldRecords() {
    if (!selectedAccount || !selectedAccount.linkedMapId) {
      toast.error("Link this account to an AgSKAN customer first")
      return
    }
    recordsLoading = true
    recordsError = null
    genProgress = "Fetching trails..."
    console.log(`[GenAg] Processing up to ${genTrailLimit} trails, map: ${selectedAccount.linkedMapId}`)
    let total = 0, generated = 0, skipped = 0
    const BATCH = 10
    try {
      // Process in batches of 10 — fast enough, small enough to survive timeouts
      for (let offset = 0; offset < genTrailLimit; offset += BATCH) {
        genProgress = `Batch ${Math.floor(offset/BATCH)+1}...`
        try {
          const { data: result, error } = await supabase.rpc("backfill_agworld_trails", {
            p_master_map_id: selectedAccount.linkedMapId,
            p_account_id: selectedAccount.id,
            p_limit: BATCH
          })
          if (error) {
            console.warn(`[GenAg] Batch failed: ${error.message}`)
            skipped += BATCH
            await new Promise(r => setTimeout(r, 200))
            continue
          }
          total += result.trails_processed || 0
          generated += result.records_generated || 0
          skipped += (result.skipped || 0)
          // Stop if no more trails to process
          if (!result.trails_processed) break
        } catch (e: any) {
          console.warn(`[GenAg] Batch failed: ${e.message}`)
          skipped += BATCH
          await new Promise(r => setTimeout(r, 200))
        }
      }

      console.log(`[GenAg] Done: ${total} trails → ${generated} records${skipped ? ` (${skipped} skipped)` : ''}`)
      genProgress = `${generated} records from ${total} trails`
      toast.success(`Generated ${generated} records from ${total} trails${skipped ? ` · ${skipped} skipped` : ''}`)
      await Promise.all([loadAgworldFieldCounts(), loadAgworldFieldList(), loadAgworldRecords(), loadTrailProgress()])
    } catch (e: any) {
      recordsError = e.message
      console.error("[GenAg] Failed:", e.message)
    } finally {
      recordsLoading = false
      genProgress = ""
    }
  }

  async function loadAgworldFieldCounts(accountId?: string) {
    const acctId = accountId || selectedAccount?.id
    if (!acctId) return
    try {
      const { count } = await supabase
        .from("agworld_fields")
        .select("*", { count: "exact", head: true })
        .eq("account_id", acctId)
      agworldFieldCount = count || 0
    } catch (e: any) {
      console.error("loadAgworldFieldCounts failed:", e.message)
      agworldFieldCount = 0
    }
  }

  async function clearAgworldData() {
    if (!selectedAccount) return
    if (!confirm("Delete ALL agworld fields, records and activities for this account? This cannot be undone.")) return
    recordsLoading = true
    try {
      await supabase.from("agworld_records").delete().eq("account_id", selectedAccount.id)
      await supabase.from("agworld_activities").delete().eq("account_id", selectedAccount.id)
      await supabase.from("agworld_fields").delete().eq("account_id", selectedAccount.id)
      agworldRecords = []
      agworldFieldCount = 0
      fieldActivityData = new Map()
      toast.success("Cleared all agworld data")
    } catch (e: any) {
      toast.error(`Clear failed: ${e.message}`)
    } finally {
      recordsLoading = false
    }
  }

  // Undo: restore original AgSKAN field data from the in-memory agskanFields array.
  // This reverses any accidental save that modified the actual fields table.
  async function undoConsolidationSave() {
    if (!selectedAccount) return
    if (!confirm("This will restore all original AgSKAN field names, areas, and boundaries from the data loaded at the start of this comparison. Continue?")) return

    savingConsolidated = true
    const errors: string[] = []
    let restored = 0

    try {
      let mapId: string | null = selectedAccount.linkedMapId || null
      if (!mapId) {
        const { data: session } = await supabase.auth.getSession()
        const userId = session?.session?.user?.id
        if (!userId) throw new Error("Not logged in")
        const { data: profile } = await supabase.from("profiles").select("master_map_id").eq("id", userId).single()
        mapId = profile?.master_map_id || null
      }
      if (!mapId) throw new Error("No AgSKAN map to restore to")

      // Restore each original field's name, area, and boundary
      for (const f of agskanFields) {
        if (!f.field_id || !f.boundary) continue
        const { error } = await supabase.from("fields").update({
          name: f.name,
          area: f.area,
          boundary: f.boundary,
        }).eq("field_id", f.field_id).eq("map_id", mapId)

        if (error) errors.push(`Restore "${f.name}": ${error.message}`)
        else restored++
      }

      // Also delete any fields that were created by the save (they won't be in agskanFields)
      // — identify them by having null farm_id on this map
      const { data: createdFields } = await supabase.from("fields")
        .select("field_id, name")
        .is("farm_id", null)
        .eq("map_id", mapId)

      if (createdFields && createdFields.length > 0) {
        const originalIds = new Set(agskanFields.map(f => f.field_id))
        const toDelete = createdFields.filter(f => !originalIds.has(f.field_id))
        for (const f of toDelete) {
          const { error } = await supabase.from("fields").delete().eq("field_id", f.field_id).eq("map_id", mapId)
          if (error) errors.push(`Delete created "${f.name}": ${error.message}`)
          else restored++
        }
      }

      if (errors.length === 0) {
        toast.success(`Restored ${restored} fields to original state`)
      } else {
        toast.warning(`Restored with ${errors.length} errors`)
      }
      saveResults = { created: 0, updated: restored, deleted: 0, errors }
    } catch (e: any) {
      toast.error(`Undo failed: ${e.message}`)
      errors.push(e.message)
      saveResults = { created: 0, updated: 0, deleted: 0, errors }
    } finally {
      savingConsolidated = false
    }
  }

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
    const wasSelected = selectedOverlayIds.includes(id)
    selectedOverlayIds = wasSelected
      ? selectedOverlayIds.filter(i => i !== id)
      : [...selectedOverlayIds, id]
    highlightedCandidate = id

    // In split mode (N fields kept, 1 deleted), the winning-side candidates ARE the
    // dominant fields — they must move in/out of dominantFieldIds to reflect
    // selection state on the map.  In merge mode (N fields absorbed into 1),
    // candidates are always non-dominant and only opacity changes — never touch
    // dominantFieldIds.
    const splitMode = proposalDominant ? dominantSideChoice !== proposalDominant.source : false
    if (splitMode) {
      if (!wasSelected) {
        dominantFieldIds = [...dominantFieldIds, id]
      } else {
        dominantFieldIds = dominantFieldIds.filter(did => did !== id)
      }
    }
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
      // If 0 candidates selected, just keep the dominant field as-is
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
      // If 0 candidates selected, still mark the dominant field's opposite side as resolved
      if (selectedCands.length === 0) {
        for (const c of proposalCandidates) {
          if (c.source === "agskan") resolvedSkanIds.add(c.id)
          else resolvedAwIds.add(c.id)
        }
      }
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

<div class="agworld-container agw-page">
  <!-- Header -->
  <div class="page-header">
    <div class="header-left">
      <Icon icon="solar:cloud-check-bold-duotone" width="24" height="24" class="text-blue-400" />
      <div>
        <h1>Agworld Integration</h1>
        <p class="header-subtitle">Manage Agworld API accounts, import field boundaries, and match spray records</p>
      </div>
    </div>
    {#if accounts.length > 0}
      <div class="header-right">
        <span class="agw-badge agw-badge-info">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</span>
      </div>
    {/if}
  </div>

  <!-- List View: Show all saved accounts -->
  {#if view === "list"}
      {#if accounts.length === 0}
        <div class="agw-empty bg-base-200">
          <Icon icon="solar:cloud-check-bold-duotone" width="48" height="48" class="agw-empty-icon" />
          <p class="agw-empty-title">No Agworld accounts configured</p>
          <p class="agw-empty-subtitle">Add an account using an API key to get started.</p>
          <button class="agw-btn agw-btn-primary" on:click={() => (view = "add")}>
            <Icon icon="solar:add-circle-bold" width="18" height="18" />
            Add Account
          </button>
        </div>
      {:else}
        <div class="page-header" style="margin-top:0">
          <div class="header-left">
            <h1>Saved Accounts</h1>
            <p class="header-subtitle">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
          </div>
          <div class="header-right">
            <button class="agw-btn agw-btn-accent" on:click={() => (view = "add")}>
              <Icon icon="solar:add-circle-bold" width="16" height="16" />
              Add Account
            </button>
          </div>
        </div>

        <div class="acct-grid">
          {#each accounts as account (account.id)}
            <div class="acct-card agw-card bg-base-200"
                 on:click={() => selectAccount(account.id)}
                 on:keydown={(e) => e.key === 'Enter' && selectAccount(account.id)}
                 role="button" tabindex="0">
              <div class="agw-card-body">
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="acct-card-name">{account.name}</span>
                      <span class="agw-badge agw-badge-sm agw-badge-outline">{AGWORLD_INSTANCES[account.instance]?.label ?? account.instance}</span>
                    </div>
                    <p class="acct-card-key" title={account.apiKey}>{account.apiKey.substring(0, 24)}...</p>
                    <p class="acct-card-meta">Added {new Date(account.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button class="agw-btn agw-btn-danger agw-btn-xs ml-2 shrink-0"
                    on:click|stopPropagation={() => handleRemove(account.id)} title="Remove">
                    <Icon icon="solar:trash-bin-trash-bold" width="14" height="14" />
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

  <!-- Add Account Form -->
  {:else if view === "add"}
    <div class="agw-page" style="max-width:500px">
      <button class="agw-btn agw-btn-ghost agw-btn-sm mb-4" on:click={backToList}>
        <Icon icon="solar:arrow-left-bold" width="16" height="16" />
        Back to accounts
      </button>

      <div class="agw-card bg-base-200">
        <div class="agw-card-body">
          <h2 class="agw-card-title mb-4">
            <Icon icon="solar:user-plus-bold-duotone" width="22" height="22" />
            Add Agworld Account
          </h2>
          <p class="text-xs opacity-50 mb-4">Enter a name, API key, and select the Agworld instance. The API key must use the <code class="agw-badge agw-badge-sm">v1_...</code> format.</p>

          <div class="mb-3">
            <label class="text-xs font-medium opacity-60 mb-1 block" for="account-name">Account Name</label>
            <input id="account-name" type="text" class="agw-input" placeholder="e.g. Beau's Agworld" bind:value={newName} />
          </div>

          <div class="mb-3">
            <label class="text-xs font-medium opacity-60 mb-1 block" for="agworld-instance">Instance</label>
            <select id="agworld-instance" class="agw-select" bind:value={newInstance}>
              {#each Object.entries(AGWORLD_INSTANCES) as [key, cfg]}
                <option value={key}>{cfg.label} — {cfg.base}</option>
              {/each}
            </select>
            <p class="text-xs opacity-30 mt-1">v3 base: {AGWORLD_INSTANCES[newInstance]?.base}/api/v3</p>
          </div>

          <div class="mb-3">
            <label class="text-xs font-medium opacity-60 mb-1 block" for="grower-id-field">Grower ID (optional)</label>
            <input id="grower-id-field" type="text" class="agw-input" style="font-family:monospace" placeholder="e.g. 70719" bind:value={newGrowerId} />
          </div>

          <div class="mb-3">
            <label class="text-xs font-medium opacity-60 mb-1 block" for="api-key">API Key <span class="opacity-40 font-normal">v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</span></label>
            <input id="api-key" type="password" class="agw-input" style="font-family:monospace" placeholder="v1_..." bind:value={newApiKey} />
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <button class="agw-btn agw-btn-ghost" on:click={backToList}>Cancel</button>
            <button class="agw-btn agw-btn-primary" on:click={handleAddAccount} disabled={adding || !newName.trim() || !newApiKey.trim()}>
              {adding ? "Adding..." : "Add Account"}
            </button>
          </div>
        </div>
      </div>
    </div>

  <!-- Account Detail / API Explorer -->
  {:else if view === "account" && selectedAccount}
    <div class="agw-page">
      <button class="agw-btn agw-btn-ghost agw-btn-sm mb-4" on:click={backToList}>
        <Icon icon="solar:arrow-left-bold" width="18" height="18" />
        Back to accounts
      </button>

      <!-- Account info bar -->
      <div class="agw-card bg-base-200 mb-5">
        <div class="agw-card-body">
          <div class="flex flex-wrap items-center gap-4">
            <div>
              <div class="flex items-center gap-2">
                <h2 style="font-size:18px;font-weight:600;margin:0">{selectedAccount.name}</h2>
                <span class="agw-badge agw-badge-sm">{instanceLabel}</span>
              </div>
              <p class="text-xs opacity-50 font-mono mt-1" title={selectedAccount.apiKey}>
                Key: {selectedAccount.apiKey.substring(0, 24)}...
              </p>
              {#if selectedAccount.growerId}
                <p class="text-xs opacity-50 font-mono mt-1">Grower: {selectedAccount.growerId}</p>
              {/if}
            </div>
            <div class="ml-auto flex gap-2">
              <button class="agw-btn agw-btn-primary agw-btn-sm" on:click={startCompare}>
                <Icon icon="solar:graph-new-bold" width="14" height="14" />Compare
              </button>
              {#if hasSavedConsolidation()}
                <button class="agw-btn agw-btn-ghost agw-btn-sm" on:click={() => {
                  if (loadConsolidationMetadata()) { view = "compare"; toast.success(`Loaded ${consolidatedFields.length} consolidated fields`) }
                  else { toast.error("Failed to load saved consolidation") }
                }}>
                  <Icon icon="solar:folder-open-bold" width="14" height="14" />Load Saved
                </button>
              {/if}
              <button class="agw-btn agw-btn-danger agw-btn-sm" on:click={() => { handleRemove(selectedAccount.id); backToList() }}>
                <Icon icon="solar:trash-bin-trash-bold" width="14" height="14" />Remove
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab navigation -->
      <div class="agw-tabs">
        <button class="agw-tab" class:active={accountTab === "explorer"} on:click={() => accountTab = "explorer"}>
          <Icon icon="solar:code-bold" width="14" height="14" />API Explorer
        </button>
        <button class="agw-tab" class:active={accountTab === "records"} on:click={() => { accountTab = "records"; loadAgworldFieldList(); loadAgworldRecords(); loadTrailProgress() }}>
          <Icon icon="solar:document-text-bold" width="14" height="14" />Records
        </button>
      </div>

      {#if accountTab === "explorer"}
      <!-- Linked AgSKAN customer -->
      <div class="agw-card bg-base-200 mb-5">
        <div class="agw-card-body">
          <h3 class="agw-card-title mb-2">
            <Icon icon="solar:link-bold-duotone" width="18" height="18" />
            Linked AgSKAN Customer
          </h3>
          <p class="text-xs opacity-50 mb-3">Compare data always uses this specific customer's map.</p>

          {#if selectedAccount.linkedMapId}
            <div class="flex items-center gap-2" style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);border-radius:10px;padding:12px 14px">
              <Icon icon="solar:check-circle-bold" width="18" height="18" style="color:#4ade80" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold truncate">{selectedAccount.linkedProfileLabel || "Linked"}</div>
                <div class="text-xs opacity-50 font-mono truncate">map_id: {selectedAccount.linkedMapId}</div>
              </div>
              <button class="agw-btn agw-btn-ghost agw-btn-xs" on:click={unlinkAccount}>Unlink</button>
            </div>
          {:else}
            <div class="agw-alert agw-alert-error mb-2">
              <Icon icon="solar:danger-triangle-bold" width="16" height="16" />
              <span class="text-xs">Not linked — compare will fall back to your own logged-in map.</span>
            </div>
            <div class="flex gap-2">
              <input type="text" class="agw-input" style="flex:1;padding:8px 12px;font-size:13px" placeholder="Search by name or email..."
                bind:value={linkSearchQuery} on:keydown={(e) => { if (e.key === 'Enter') searchAgskanProfiles() }} />
              <button class="agw-btn agw-btn-primary agw-btn-sm" on:click={searchAgskanProfiles} disabled={linkSearching}>
                {#if linkSearching}<span class="agw-spinner"></span>{:else}<Icon icon="solar:magnifer-linear" width="14" height="14" />{/if}
                Search
              </button>
            </div>
            {#if linkSearchResults.length > 0}
              <div class="mt-2 space-y-1" style="max-height:240px;overflow-y:auto">
                {#each linkSearchResults as p (p.id)}
                  <button class="w-full text-left p-2 rounded-lg border border-base-300 hover:bg-base-300/50 flex items-center justify-between gap-2"
                    on:click={() => linkAccountToProfile(p)}>
                    <div class="min-w-0">
                      <div class="text-sm truncate">{p.full_name || "(no name)"}</div>
                      <div class="text-xs opacity-50 truncate">{p.email}</div>
                    </div>
                    {#if p.master_map_id}
                      <span class="agw-badge agw-badge-sm agw-badge-success shrink-0">has map</span>
                    {:else}
                      <span class="agw-badge agw-badge-sm agw-badge-outline shrink-0">no map</span>
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
      <div class="grid gap-5 lg:grid-cols-3">
        <!-- Left: Quick Query Panel -->
        <div class="lg:col-span-1 space-y-4">
            <div class="agw-card bg-base-200">
            <div class="agw-card-body">
              <h3 class="agw-card-title mb-3">
                <Icon icon="solar:play-circle-bold-duotone" width="18" height="18" />
                Quick Queries
              </h3>

              <label class="text-sm font-medium opacity-70 mb-2 block">Grower ID</label>
              <input type="text" class="agw-input" style="font-family:monospace;font-size:14px;padding:8px 12px" placeholder="CPY-AU-..." bind:value={queryGrowerId} />

              <div class="query-grid">
                {#each QUICK_QUERIES as q}
                  <button class="query-btn" class:active={queryEndpoint === q.endpoint}
                    style={queryEndpoint === q.endpoint ? 'border-color:rgba(59,130,246,0.5);color:#60a5fa;font-weight:600' : ''}
                    on:click={() => { queryEndpoint = q.endpoint; runQuery(q.endpoint) }}
                    disabled={apiLoading}>
                    {#if apiLoading && queryEndpoint === q.endpoint}
                      <span class="agw-spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;margin-right:4px"></span>
                    {/if}
                    {q.label}
                    {#if q.needsGrower}<span class="opacity-50 text-[10px] ml-1">grower</span>{/if}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- API Docs Quick Reference -->
          <div class="agw-card bg-base-200 mt-3">
            <div class="agw-card-body">
              <h3 class="agw-card-title mb-2">
                <Icon icon="solar:bookmark-bold-duotone" width="18" height="18" />
                API Reference
              </h3>
              <div class="text-xs opacity-50 space-y-2">
                <p><strong>Base:</strong> <span class="agw-badge agw-badge-sm" style="font-family:monospace">{AGWORLD_INSTANCES[selectedAccount.instance]?.base}/api/v3</span></p>
                <p><strong>Auth:</strong> <span class="agw-badge agw-badge-sm" style="font-family:monospace">API-Key v1_...</span></p>
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
          <div class="agw-card bg-base-200">
            <div class="agw-card-body">
              <div class="flex items-center justify-between">
                <h3 class="agw-card-title">
                  <Icon icon="solar:document-text-bold-duotone" width="18" height="18" />Response
                </h3>
                <div class="flex items-center gap-2">
                  {#if apiStatus !== null}
                    <span class="agw-badge agw-badge-sm" class:agw-badge-success={apiStatus >= 200 && apiStatus < 300} class:agw-badge-error={apiStatus >= 400}>
                      HTTP {apiStatus}
                    </span>
                  {/if}
                  {#if apiResult}
                    <button class="agw-btn agw-btn-ghost agw-btn-xs" on:click={() => {
                      navigator.clipboard.writeText(formatJson(apiResult)); toast.success("Copied to clipboard")
                    }}>
                      <Icon icon="solar:copy-bold" width="12" height="12" />Copy
                    </button>
                  {/if}
                </div>
              </div>

              <div class="mt-3">
                {#if apiLoading}
                  <div class="agw-loading"><span class="agw-spinner" style="width:32px;height:32px;border-width:3px"></span></div>
                {:else if apiError}
                  <div class="agw-alert agw-alert-error">
                    <Icon icon="solar:danger-circle-bold" width="20" height="20" />
                    <span>{apiError}</span>
                  </div>
                {:else if apiResult}
                  <pre class="bg-base-300 rounded-lg p-4 text-xs overflow-auto" style="max-height:500px"><code>{formatJson(apiResult)}</code></pre>
                {:else}
                  <div class="agw-empty" style="background:transparent;padding:32px 0">
                    <Icon icon="solar:cloud-arrow-up-bold-duotone" width="40" height="40" class="agw-empty-icon" />
                    <p class="agw-empty-subtitle">Run a query to see the API response</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Request Logs -->
          {#if requestLogs.length > 0}
            <div class="agw-card bg-base-200">
              <div class="agw-card-body">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="agw-card-title">
                    <Icon icon="solar:list-check-bold-duotone" width="18" height="18" />Request Logs ({requestLogs.length})
                  </h3>
                  <button class="agw-btn agw-btn-danger agw-btn-xs" on:click={clearLogs}>
                    <Icon icon="solar:eraser-bold" width="12" height="12" />Clear
                  </button>
                </div>

                <div class="space-y-2">
                  {#each requestLogs as log (log.id)}
                    <div class="log-entry">
                      <button class="log-summary" on:click={() => toggleLog(log.id)}>
                        <span class="agw-badge agw-badge-sm" class:agw-badge-success={log.status && log.status < 300} class:agw-badge-error={log.status && log.status >= 400}>
                          {log.status ?? 'ERR'}
                        </span>
                        <span class="agw-badge agw-badge-sm agw-badge-outline">{log.apiVersion}</span>
                        <code class="text-xs flex-1 truncate">{log.method} {log.url}</code>
                        <span class="text-xs opacity-50">{log.durationMs}ms</span>
                        <Icon icon={expandedLogId === log.id ? "solar:alt-arrow-up-bold" : "solar:alt-arrow-down-bold"} width="14" height="14" />
                      </button>

                      {#if expandedLogId === log.id}
                        <div class="log-detail text-xs space-y-3">
                          <div>
                            <div class="font-semibold mb-1" style="color:#60a5fa">▶ REQUEST</div>
                            <div class="bg-base-100 rounded p-2 space-y-1">
                              <div><span class="opacity-50">Time:</span> {log.timestamp}</div>
                              <div><span class="opacity-50">API:</span> {log.apiVersion} · {log.instance}</div>
                              <div><span class="opacity-50">URL:</span> <code class="break-all">{log.url}</code></div>
                              <div class="mt-1"><span class="opacity-50">Headers:</span></div>
                              {#each Object.entries(log.requestHeaders) as [key, val]}
                                <div class="ml-2">
                                  <code class="opacity-50">{key}:</code>
                                  {#if key.toLowerCase() === 'authorization'}
                                    <code style="color:#fbbf24">{val.substring(0, 24)}...</code>
                                  {:else}
                                    <code>{val}</code>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          </div>

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

                          <button class="agw-btn agw-btn-ghost agw-btn-xs" on:click={() => copyLog(log)}>
                            <Icon icon="solar:copy-bold" width="12" height="12" />Copy full log
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
    {:else}
      <!-- Records tab — styled to match /account/records -->
      <div class="agworld-records">
        <!-- Header -->
        <div class="page-header">
          <div class="header-left">
            <Icon icon="solar:document-text-bold-duotone" width="24" height="24" class="text-blue-400" />
            <div>
              <h1>Agworld Records</h1>
              <p class="header-subtitle">
                {agworldRecords.length} record{agworldRecords.length !== 1 ? 's' : ''}
                · {agworldRecords.reduce((s, r) => s + (r.area_hectares || 0), 0).toFixed(1)} ha total
                · {agworldRecords.reduce((s, r) => s + (r.distance_km || 0), 0).toFixed(1)} km traveled
              </p>
            </div>
          </div>
          <div class="header-right">
            <button class="action-btn action-btn-accent" on:click={importAllAgworldFields} disabled={savingConsolidated}>
              {#if savingConsolidated}
                <span class="loading loading-spinner loading-xs"></span>
              {:else}
                <Icon icon="solar:cloud-download-bold" width="14" height="14" />
              {/if}
              <span>Import Fields</span>
            </button>
            <button class="action-btn action-btn-primary" on:click={matchSprayToAgworld} disabled={recordsLoading}>
              {#if recordsLoading}
                <span class="loading loading-spinner loading-xs"></span>
              {:else}
                <Icon icon="solar:scan-bold" width="14" height="14" />
              {/if}
              <span>Match Records</span>
            </button>
            <button class="action-btn action-btn-accent" on:click={generateAgworldRecords} disabled={recordsLoading} title="Generate records from the next batch of unprocessed trails">
              {#if recordsLoading}
                <span class="loading loading-spinner loading-xs"></span>
              {:else}
                <Icon icon="solar:lightning-bold" width="14" height="14" />
              {/if}
              <span>Generate Records</span>
            </button>
            {#if trailProgress.total > 0}
              <span class="count-badge" title="Backfilled back to {trailProgress.oldest_processed ? new Date(trailProgress.oldest_processed).toLocaleDateString('en-AU') : 'N/A'}">
                <Icon icon="solar:check-read-bold" width="14" height="14" class="text-green-400" />
                <span>{trailProgress.processed}/{trailProgress.total} trails</span>
                {#if trailProgress.oldest_processed}
                  <span class="text-xs opacity-50">· since {new Date(trailProgress.oldest_processed).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                {/if}
              </span>
            {/if}
            <button class="action-btn action-btn-danger" on:click={clearAgworldData} disabled={recordsLoading || savingConsolidated} title="Delete all agworld fields & records">
              <Icon icon="solar:eraser-bold" width="14" height="14" />
            </button>
            <div class="count-badge">
              <Icon icon="solar:map-point-bold" width="14" height="14" class="text-green-400" />
              <span>{agworldFieldCount} field{agworldFieldCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        <!-- Filters Bar -->
        <div class="filters-bar">
          <div class="search-box bg-base-100 border border-base-300">
            <Icon icon="solar:magnifer-bold" width="16" height="16" class="text-contrast-content/40" />
            <input type="text" placeholder="Search fields, operators, vehicles..." bind:value={recordSearchQuery} />
          </div>

          {#if true}
            {@const years = [...new Set(agworldFieldList.map(f => f.production_year))].filter(Boolean).sort((a,b) => b-a)}
            {#if years.length > 0}
              <div class="year-chips">
                {#each years as y}
                  <button class="year-chip bg-base-100 border border-base-300" class:active={selectedYear === y}
                    on:click={() => selectedYear = selectedYear === y ? null : y}>{y}</button>
                {/each}
                {#if selectedYear}
                  <button class="year-chip year-chip-clear" on:click={() => selectedYear = null}>✕ Clear</button>
                {/if}
              </div>
            {/if}
          {/if}
        </div>

        <!-- Field Trail Overlay -->
        {#if showMap && overlayField}
          <FieldTrailOverlay
            fieldBoundary={overlayField.boundary}
            records={overlayRecords}
            fieldName={overlayField.name || overlayField.agworld_field_name}
            fieldAreaHa={overlayField.area || 0}
            on:close={() => { showMap = false; overlayField = null }}
          />
        {/if}

        <!-- Agworld Activity Sync banner -->
        {#if farmGroups.length > 0}
          {@const syncableFields = agworldFieldList.filter(f => f.properties?.agworld_boundary_id || f.agworld_field_ref).length}
          {@const syncedFields = agworldFieldList.filter(f => f.last_activity_sync_at).length}
          {@const cachedFields = fieldActivityData.size}
          <div class="activity-banner">
            <div class="activity-banner-info">
              <Icon icon="solar:cloud-download-bold-duotone" width="18" height="18" class="text-purple-400" />
              {#if syncProgress}
                <span class="text-sm">{syncProgress}</span>
              {:else if syncedFields > 0}
                <span>
                  <strong>Agworld Activity Data</strong>
                  <span class="opacity-60"> — {syncedFields} field{syncedFields !== 1 ? 's' : ''} synced · last: {new Date(Math.max(...agworldFieldList.filter(f => f.last_activity_sync_at).map(f => new Date(f.last_activity_sync_at).getTime()))).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              {:else}
                <span>
                  <strong>Agworld Activity Data</strong>
                  <span class="opacity-60"> — Click <span class="activity-btn-inline">Activity</span> on a field or <span class="activity-btn-inline">Sync All</span> to pull actuals, work orders &amp; plans</span>
                </span>
              {/if}
            </div>
            {#if syncProgress}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <button class="action-btn action-btn-accent" style="background:rgba(139,92,246,0.1);border-color:rgba(139,92,246,0.2);color:#a78bfa" on:click={syncAllActivity}>
                <Icon icon="solar:refresh-bold" width="14" height="14" />
                <span>Sync All</span>
              </button>
            {/if}
          </div>
        {/if}

        <!-- Loading / Error -->
        {#if recordsLoading}
          <div class="loading-state">
            <span class="loading loading-spinner loading-lg"></span>
            <p>{genProgress || "Loading records..."}</p>
          </div>
        {:else if recordsError}
          <div class="error-state">
            <Icon icon="solar:danger-circle-bold" width="48" height="48" class="opacity-20" />
            <p class="font-medium">Error loading records</p>
            <p class="text-xs opacity-50">{recordsError}</p>
          </div>
        {:else}
          <!-- Field list — always visible when loaded, even with no records -->
          {#if farmGroups.length > 0}
            <div class="fields-grouped">
              {#if agworldRecords.length === 0}
                <div class="empty-state" style="padding:24px;margin-bottom:12px">
                  <Icon icon="solar:document-text-bold" width="32" height="32" class="opacity-20" />
                  <p class="agw-empty-subtitle">No spray records matched yet. Click "Match Spray Records" to find which spray jobs overlap these fields.</p>
                </div>
              {/if}
              {#each farmGroups as farmGroup (farmGroup.name)}
                <div class="field-group bg-base-200 border border-base-300">
                  <div class="field-group-header" on:click={() => toggleFarmExpand(farmGroup.name)}>
                    <Icon icon="solar:buildings-bold-duotone" width="18" height="18" class="text-info shrink-0" />
                    <div class="field-group-info">
                      <span class="field-group-name">{farmGroup.name}</span>
                      <span class="field-group-count">{farmGroup.fields.length} field{farmGroup.fields.length !== 1 ? 's' : ''} · {farmGroup.totalHa.toFixed(1)} ha</span>
                    </div>
                    <span class="expand-icon">
                      {#if expandedFarms.has(farmGroup.name)}
                        <Icon icon="solar:alt-arrow-down-bold" width="16" height="16" />
                      {:else}
                        <Icon icon="solar:alt-arrow-right-bold" width="16" height="16" />
                      {/if}
                    </span>
                  </div>

                  {#if expandedFarms.has(farmGroup.name)}
                    <div class="field-group-fields">
                      {#each farmGroup.fields as field (field.id)}
                        <div class="field-card bg-base-100 border border-base-300" class:selected={selectedFieldId === field.id}>
                          <div class="field-card-header" on:click={() => toggleFieldExpand(field.id)}>
                            <div class="field-thumb-wrap" on:click|stopPropagation={() => openFieldOverlay(field)} role="button" tabindex="0" title="View on map">
                              <FieldOutlineThumbnail boundary={field.boundary} width={72} height={54} fillColor="#16a34a" outlineColor="#86efac" />
                            </div>
                            <div class="field-card-info">
                              <div class="field-card-name">
                                <Icon icon="solar:map-point-bold" width="14" height="14" class="text-green-400" />
                                <span>{field.name || field.agworld_field_name}</span>
                              </div>
                              <div class="field-card-meta">
                                {field.area ? field.area.toFixed(1) + ' ha' : '-'}
                                {#if field.crop_type}<span class="crop-badge">{field.crop_type}</span>{/if}
                                {#if field.production_year}<span class="year-tag">{field.production_year}</span>{/if}
                              </div>
                            </div>
                            <div class="field-card-actions">
                              <span class="record-count-badge">{agworldRecords.filter(r => r.agworld_field_id === field.id).length} record{agworldRecords.filter(r => r.agworld_field_id === field.id).length !== 1 ? 's' : ''}</span>
                              {#if field.agworld_field_ref}
                                {@const ad = fieldActivityData.get(field.id)}
                                {@const adTotal = ad ? (ad.actuals?.length || 0) + (ad.workOrders?.length || 0) + (ad.plans?.length || 0) : 0}
                                {@const isSynced = !!field.last_activity_sync_at}
                                <button
                                  class="activity-btn"
                                  class:loading={fieldActivityLoading.has(field.id)}
                                  class:has-data={adTotal > 0}
                                  class:synced={isSynced}
                                  on:click|stopPropagation={() => fetchFieldActivity(field)}
                                  title={isSynced ? `Synced ${new Date(field.last_activity_sync_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${adTotal} items — click to refresh` : "Fetch Agworld activity data"}
                                >
                                  {#if fieldActivityLoading.has(field.id)}
                                    <span class="loading loading-spinner loading-xs"></span>
                                  {:else if isSynced}
                                    <Icon icon="solar:refresh-bold" width="12" height="12" class="text-green-400" />
                                  {:else}
                                    <Icon icon="solar:cloud-download-bold" width="12" height="12" />
                                  {/if}
                                  Activity
                                  {#if adTotal > 0}
                                    <span class="activity-btn-badge">{adTotal}</span>
                                  {/if}
                                </button>
                              {/if}
                              {#if field.boundary}
                                <button class="map-btn" on:click|stopPropagation={() => openFieldOverlay(field)} title="View on map">
                                  <Icon icon="solar:map-point-bold" width="12" height="12" /> Map
                                </button>
                              {/if}
                              <span class="expand-icon">
                                {#if expandedFields.has(field.id)}
                                  <Icon icon="solar:alt-arrow-down-bold" width="16" height="16" />
                                {:else}
                                  <Icon icon="solar:alt-arrow-right-bold" width="16" height="16" />
                                {/if}
                              </span>
                            </div>
                          </div>

                          {#if expandedFields.has(field.id) && agworldRecords.filter(r => r.agworld_field_id === field.id).length > 0}
                            <div class="field-records">
                              {#each agworldRecords.filter(r => r.agworld_field_id === field.id) as rec (rec.id)}
                                <div class="record-row">
                                  <span class="record-date">{rec.start_time ? new Date(rec.start_time).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</span>
                                  <span class="record-meta">
                                    <Icon icon="solar:user-bold" width="11" height="11" class="opacity-30" />
                                    {rec.operator_name || '-'}
                                  </span>
                                  <span class="record-meta">
                                    <Icon icon="solar:tractor-bold" width="11" height="11" class="opacity-30" />
                                    {rec.vehicle_type || rec.vehicle_marker?.type || '-'}
                                  </span>
                                  <span class="record-stat">{rec.area_hectares ? rec.area_hectares.toFixed(1) + ' ha' : '-'}</span>
                                  <span class="record-stat">{rec.distance_km ? rec.distance_km.toFixed(1) + ' km' : '-'}</span>
                                  <span class="record-method">{rec.gen_method || ''}</span>
                                </div>
                              {/each}
                            </div>
                          {/if}

                          <!-- Agworld Activity Data -->
                          {#if expandedActivityFields.has(field.id)}
                            {@const activity = fieldActivityData.get(field.id)}
                            <div class="field-activity">
                              {#if activity?.error}
                                <div class="activity-error">
                                  <Icon icon="solar:danger-triangle-bold" width="14" height="14" />
                                  {activity.error}
                                </div>
                              {:else if activity}
                                {@const tl = getMergedTimeline(activity)}
                                {@const totalItems = tl.convertedPairs.length + tl.unmatchedActuals.length + tl.pendingPlans.length + tl.workOrders.length}
                                {#if totalItems === 0}
                                  <div class="activity-empty">No actuals, work orders, or plans found for this field.</div>
                                {:else}
                                  <!-- Converted: Plan → Actual -->
                                  {#if tl.convertedPairs.length > 0}
                                    <div class="activity-group">
                                      <div class="activity-group-header">
                                        <Icon icon="solar:transfer-vertical-bold" width="14" height="14" class="text-success" />
                                        <span>Completed</span>
                                        <span class="activity-count">{tl.convertedPairs.length}</span>
                                      </div>
                                      {#each tl.convertedPairs as pair (pair.actual.id)}
                                        {@const aAttrs = pair.actual.attributes || {}}
                                        <div class="activity-row converted" on:click|stopPropagation={() => openActivityModal(pair.actual.id, pair.actual)}>
                                          <span class="activity-date">{aAttrs.completed_at ? new Date(aAttrs.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : aAttrs.started_at ? new Date(aAttrs.started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</span>
                                          <span class="activity-lifecycle">
                                            <span class="lifecycle-badge plan">Plan</span>
                                            <Icon icon="solar:arrow-right-bold" width="10" height="10" class="opacity-30" />
                                            <span class="lifecycle-badge actual">Actual</span>
                                          </span>
                                          <span class="activity-status completed">{aAttrs.status || 'completed'}</span>
                                          <span class="activity-name">{aAttrs.name || aAttrs.operation_type_name || '-'}</span>
                                        </div>
                                      {/each}
                                    </div>
                                  {/if}

                                  <!-- Discarded but completed (parent_id confirms link despite discarded status) -->
                                  {#if tl.discardedConvertedPairs.length > 0}
                                    <div class="activity-group">
                                      <div class="activity-group-header">
                                        <Icon icon="solar:danger-triangle-bold" width="14" height="14" class="text-warning" />
                                        <span>Discarded (work done)</span>
                                        <span class="activity-count">{tl.discardedConvertedPairs.length}</span>
                                      </div>
                                      {#each tl.discardedConvertedPairs as pair (pair.actual.id)}
                                        {@const aAttrs = pair.actual.attributes || {}}
                                        <div class="activity-row discarded-converted" on:click|stopPropagation={() => openActivityModal(pair.actual.id, pair.actual)}>
                                          <span class="activity-date">{aAttrs.completed_at ? new Date(aAttrs.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : aAttrs.started_at ? new Date(aAttrs.started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</span>
                                          <span class="activity-lifecycle">
                                            <span class="lifecycle-badge discarded-plan">Discarded</span>
                                            <Icon icon="solar:arrow-right-bold" width="10" height="10" class="opacity-30" />
                                            <span class="lifecycle-badge actual">Actual</span>
                                          </span>
                                          <span class="activity-status" style="color:#f59e0b">work done</span>
                                          <span class="activity-name">{aAttrs.name || aAttrs.operation_type_name || '-'}</span>
                                        </div>
                                      {/each}
                                    </div>
                                  {/if}

                                  <!-- Standalone Actuals -->
                                  {#if tl.unmatchedActuals.length > 0}
                                    <div class="activity-group">
                                      <div class="activity-group-header">
                                        <Icon icon="solar:check-circle-bold" width="14" height="14" class="text-success" />
                                        <span>Actuals</span>
                                        <span class="activity-count">{tl.unmatchedActuals.length}</span>
                                      </div>
                                      {#each tl.unmatchedActuals as a (a.id)}
                                        {@const attrs = a.attributes || {}}
                                        <div class="activity-row" on:click|stopPropagation={() => openActivityModal(a.id, a)}>
                                          <span class="activity-date">{attrs.completed_at ? new Date(attrs.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : attrs.started_at ? new Date(attrs.started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</span>
                                          <span class="activity-type-badge actual">Actual</span>
                                          <span class="activity-status" class:completed={attrs.status === 'completed'}>{attrs.status || '-'}</span>
                                          <span class="activity-name">{attrs.name || attrs.operation_type_name || '-'}</span>
                                        </div>
                                      {/each}
                                    </div>
                                  {/if}

                                  <!-- Work Orders -->
                                  {#if tl.workOrders.length > 0}
                                    <div class="activity-group">
                                      <div class="activity-group-header">
                                        <Icon icon="solar:clipboard-list-bold" width="14" height="14" class="text-warning" />
                                        <span>Work Orders</span>
                                        <span class="activity-count">{tl.workOrders.length}</span>
                                      </div>
                                      {#each tl.workOrders as wo (wo.id)}
                                        {@const attrs = wo.attributes || {}}
                                        <div class="activity-row" on:click|stopPropagation={() => openActivityModal(wo.id, wo)}>
                                          <span class="activity-date">{attrs.due_date ? new Date(attrs.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</span>
                                          <span class="activity-type-badge work-order">W/O</span>
                                          <span class="activity-status" class:completed={attrs.status === 'closed'}>{attrs.status || '-'}</span>
                                          <span class="activity-name">{attrs.name || attrs.operation_type_name || '-'}</span>
                                        </div>
                                      {/each}
                                    </div>
                                  {/if}

                                  <!-- Pending Plans (not yet converted) -->
                                  {#if tl.pendingPlans.length > 0}
                                    <div class="activity-group">
                                      <div class="activity-group-header">
                                        <Icon icon="solar:documents-bold" width="14" height="14" class="text-info" />
                                        <span>Plans</span>
                                        <span class="activity-count">{tl.pendingPlans.length}</span>
                                      </div>
                                      {#each tl.pendingPlans as p (p.id)}
                                        {@const attrs = p.attributes || {}}
                                        {@const isOverdue = attrs.due_at && new Date(attrs.due_at) < new Date() && (attrs.status === 'todo' || attrs.status === 'in_progress')}
                                        <div class="activity-row" on:click|stopPropagation={() => openActivityModal(p.id, p)}>
                                          <span class="activity-date">{attrs.due_at ? new Date(attrs.due_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</span>
                                          <span class="activity-type-badge plan">Plan</span>
                                          {#if isOverdue}
                                            <span class="overdue-badge">Overdue</span>
                                          {/if}
                                          <span class="activity-status" class:completed={attrs.status === 'completed'}>{attrs.status || '-'}</span>
                                          <span class="activity-name">{attrs.name || attrs.operation_type_name || '-'}</span>
                                        </div>
                                      {/each}
                                    </div>
                                  {/if}

                                  <!-- Discarded Plans -->
                                  {#if tl.discardedPlans.length > 0}
                                    <div class="activity-group">
                                      <div class="activity-group-header">
                                        <Icon icon="solar:trash-bin-trash-bold" width="14" height="14" class="opacity-30" />
                                        <span>Discarded</span>
                                        <span class="activity-count">{tl.discardedPlans.length}</span>
                                      </div>
                                      {#each tl.discardedPlans as p (p.id)}
                                        {@const attrs = p.attributes || {}}
                                        <div class="activity-row discarded">
                                          <span class="activity-date">{attrs.due_at ? new Date(attrs.due_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</span>
                                          <span class="activity-type-badge discarded-plan">Discarded</span>
                                          <span class="activity-status discarded-status">{attrs.status || '-'}</span>
                                          <span class="activity-name discarded-name">{attrs.name || attrs.operation_type_name || '-'}</span>
                                        </div>
                                      {/each}
                                    </div>
                                  {/if}
                                {/if}
                              {/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <!-- No fields AND no records -->
            <div class="empty-state">
              <Icon icon="solar:document-text-bold" width="48" height="48" class="opacity-20" />
              <p>No Agworld records yet</p>
              <p class="empty-subtitle">
                Click "Import Agworld Fields" to pull field boundaries from Agworld, then "Match Spray Records" to find which AgSKAN spray jobs fall within each Agworld field.
              </p>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
    </div>

    <!-- Activity Detail Modal -->
    {#if activityModal && activityModalData}
      {@const m = activityModal}
      {@const d = activityModalData}
      {@const attrs = m.resource.attributes || {}}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="modal-backdrop" on:click={closeActivityModal}>
        <div class="modal-content" style="background:#1f2937;color:#e5e7eb" on:click|stopPropagation>
          <div class="modal-header">
            <div>
              <h2 class="modal-title">{attrs.name || attrs.operation_type_name || m.type}</h2>
              <span class="modal-subtitle">
                {m.type}
                {#if attrs.status}<span class="px-2 py-0.5 rounded text-xs font-semibold" style={attrs.status === 'completed' || attrs.status === 'closed' ? 'background:rgba(34,197,94,0.1);color:#22c55e' : attrs.status === 'todo' || attrs.status === 'in_progress' ? 'background:rgba(245,158,11,0.1);color:#f59e0b' : 'background:rgba(239,68,68,0.1);color:#ef4444'}>{attrs.status}</span>{/if}
              </span>
            </div>
            <button class="modal-close" on:click={closeActivityModal}>
              <Icon icon="solar:close-circle-bold" width="24" height="24" />
            </button>
          </div>

          {#if d.loading}
            <div class="modal-body flex items-center justify-center py-12">
              <span class="loading loading-spinner loading-lg"></span>
            </div>
          {:else if d.error}
            <div class="modal-body text-error">{d.error}</div>
          {:else}
            <div class="modal-body">
              <!-- Dates -->
              <div class="modal-section">
                <h3 class="modal-section-title"><Icon icon="solar:calendar-bold" width="14" height="14" /> Dates</h3>
                <div class="modal-grid">
                  {#if attrs.started_at}<div><span class="modal-label">Started</span><span class="modal-value">{new Date(attrs.started_at).toLocaleString('en-AU')}</span></div>{/if}
                  {#if attrs.completed_at}<div><span class="modal-label">Completed</span><span class="modal-value">{new Date(attrs.completed_at).toLocaleString('en-AU')}</span></div>{/if}
                  {#if attrs.due_at}<div><span class="modal-label">Due</span><span class="modal-value">{new Date(attrs.due_at).toLocaleString('en-AU')}</span></div>{/if}
                  {#if attrs.created_at}<div><span class="modal-label">Created</span><span class="modal-value">{new Date(attrs.created_at).toLocaleString('en-AU')}</span></div>{/if}
                  {#if attrs.updated_at}<div><span class="modal-label">Updated</span><span class="modal-value">{new Date(attrs.updated_at).toLocaleString('en-AU')}</span></div>{/if}
                  {#if !attrs.started_at && !attrs.completed_at && !attrs.due_at && !attrs.created_at}<span class="opacity-60 text-sm">No dates recorded</span>{/if}
                </div>
              </div>

              <!-- Area -->
              <div class="modal-section">
                <h3 class="modal-section-title"><Icon icon="solar:map-point-bold" width="14" height="14" /> Area</h3>
                {#if d.areaHa}
                  <span class="modal-value">{d.areaHa.toFixed(1)} ha</span>
                {:else}
                  <span class="opacity-60 text-sm">Not recorded</span>
                {/if}
              </div>

              <!-- Operations -->
              <div class="modal-section">
                <h3 class="modal-section-title"><Icon icon="solar:settings-bold" width="14" height="14" /> Operations</h3>
                {#if d.operations.length > 0}
                  {#each d.operations as op}
                    {@const oAttrs = op.attributes || {}}
                    <div class="modal-row">
                      <span class="modal-value">{oAttrs.name || 'Unknown operation'}</span>
                      {#if oAttrs.application_rate}<span class="opacity-50 text-sm">· {oAttrs.application_rate} {oAttrs.application_rate_unit || ''}</span>{/if}
                      {#if oAttrs.mix_method}<span class="opacity-60 text-xs ml-2">({oAttrs.mix_method})</span>{/if}
                    </div>
                  {/each}
                {:else}
                  <span class="opacity-60 text-sm">Not recorded</span>
                {/if}
              </div>

              <!-- Products -->
              <div class="modal-section">
                <h3 class="modal-section-title"><Icon icon="solar:dropper-bold" width="14" height="14" /> Products Applied</h3>
                {#if d.products.length > 0}
                  {#each d.products as prod}
                    {@const pAttrs = prod.attributes || {}}
                    {@const productExtras = Object.entries(pAttrs).filter(([k]) => k !== 'name' && k !== 'created_at' && k !== 'updated_at' && k !== 'sort_order').filter(([,v]) => v !== null && v !== undefined && v !== '')}
                    <div class="modal-row">
                      <span class="modal-value font-semibold">{pAttrs.name || 'Unknown product'}</span>
                    </div>
                    {#if productExtras.length > 0}
                      <div class="modal-attr-grid">
                        {#each productExtras as [key, val]}
                          <div><span class="modal-label">{key.replace(/_/g, ' ')}</span><span class="modal-value text-xs">{val}</span></div>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                {:else}
                  <span class="opacity-60 text-sm">Not recorded</span>
                {/if}
              </div>

              <!-- Operator -->
              <div class="modal-section">
                <h3 class="modal-section-title"><Icon icon="solar:user-bold" width="14" height="14" /> Operator</h3>
                {#if d.operatorUsers.length > 0}
                  {#each d.operatorUsers as u}
                    {@const uAttrs = u.attributes || {}}
                    <span class="modal-value">{uAttrs.name || uAttrs.email || 'Unknown operator'}</span>
                    {@const userExtras = Object.entries(uAttrs).filter(([k]) => k !== 'name' && k !== 'email' && k !== 'created_at' && k !== 'updated_at').filter(([,v]) => v !== null && v !== undefined && v !== '')}
                    {#if userExtras.length > 0}
                      <div class="modal-attr-grid">
                        {#each userExtras as [key, val]}
                          <div><span class="modal-label">{key.replace(/_/g, ' ')}</span><span class="modal-value text-xs">{val}</span></div>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                {:else}
                  <span class="opacity-60 text-sm">Not recorded</span>
                {/if}
              </div>

              <!-- Equipment -->
              <div class="modal-section">
                <h3 class="modal-section-title"><Icon icon="solar:tractor-bold" width="14" height="14" /> Equipment</h3>
                {#if d.assets.length > 0}
                  {#each d.assets as asset}
                    {@const aAttrs = asset.attributes || {}}
                    <span class="modal-value">{aAttrs.name || aAttrs.asset_name || 'Unknown equipment'}</span>
                    {@const assetExtras = Object.entries(aAttrs).filter(([k]) => k !== 'name' && k !== 'created_at' && k !== 'updated_at').filter(([,v]) => v !== null && v !== undefined && v !== '')}
                    {#if assetExtras.length > 0}
                      <div class="modal-attr-grid">
                        {#each assetExtras as [key, val]}
                          <div><span class="modal-label">{key.replace(/_/g, ' ')}</span><span class="modal-value text-xs">{val}</span></div>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                {:else}
                  <span class="opacity-60 text-sm">Not recorded</span>
                {/if}
              </div>

              <!-- Weather -->
              <div class="modal-section">
                <h3 class="modal-section-title"><Icon icon="solar:cloud-bold" width="14" height="14" /> Weather</h3>
                {#if d.weatherRecords.length > 0}
                  {#each d.weatherRecords as w}
                    {@const wAttrs = w.attributes || {}}
                    {@const weatherExtras = Object.entries(wAttrs).filter(([k]) => k !== 'created_at' && k !== 'updated_at').filter(([,v]) => v !== null && v !== undefined && v !== '')}
                    {#if weatherExtras.length > 0}
                      <div class="modal-attr-grid">
                        {#each weatherExtras as [key, val]}
                          <div><span class="modal-label">{key.replace(/_/g, ' ')}</span><span class="modal-value text-xs">{val}</span></div>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                {:else}
                  <span class="opacity-60 text-sm">Not recorded</span>
                {/if}
              </div>

              <!-- API Explorer - raw data view -->
              {#if [...d.products, ...d.operations, ...d.operatorUsers, ...d.assets, ...d.weatherRecords].length > 0}
                {@const allSubs = [...d.products.map(r => ({label:'Product',r})), ...d.operations.map(r => ({label:'Operation',r})), ...d.operatorUsers.map(r => ({label:'Operator',r})), ...d.assets.map(r => ({label:'Asset',r})), ...d.weatherRecords.map(r => ({label:'Weather',r}))]}
                <div class="modal-section">
                  <details>
                    <summary class="modal-section-title" style="cursor:pointer">
                      <Icon icon="solar:code-bold" width="14" height="14" /> Raw API Data ({allSubs.length} resources)
                    </summary>
                    <div class="mt-2 space-y-2">
                      {#each allSubs as sub (sub.r.id)}
                        {@const attrs = sub.r.attributes || {}}
                        {@const rels = sub.r.relationships || {}}
                        {@const relEntries = Object.entries(rels).filter(([k,v]) => v?.data && (Array.isArray(v.data) ? v.data.length > 0 : true))}

                        {#if surfCardId === sub.r.id}
                          <!-- Surf mode: breadcrumb navigation within this card -->
                          {@const current = surfStack[surfStack.length - 1]}
                          <div class="surf-card" style="border-color:rgba(139,92,246,0.3)">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                              <div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap">
                                {#each surfStack as step, i}
                                  {#if i > 0}<span style="color:inherit;opacity:0.2">/</span>{/if}
                                  <button
                                    style="font-size:10px;padding:1px 5px;border-radius:3px;border:none;background:transparent;color:inherit;opacity:{i === surfStack.length - 1 ? 0.9 : 0.4};cursor:pointer"
                                    on:click|stopPropagation={() => surfBackTo(i)}
                                    disabled={step.loading}>
                                    {step.loading ? '...' : step.label}
                                  </button>
                                {/each}
                              </div>
                              <button style="font-size:10px;color:inherit;opacity:0.4;background:none;border:none;cursor:pointer" on:click|stopPropagation={closeSurf}>x</button>
                            </div>
                            {#if current.loading}
                              <span class="loading loading-spinner loading-xs"></span> Loading...
                            {:else if current.error}
                              <span style="color:#f87171;font-size:11px">{current.error}</span>
                            {:else if current.data}
                              {#if current.data.attributes}
                                <div class="modal-attr-grid" style="margin:4px 0">
                                  {#each Object.entries(current.data.attributes).filter(([k]) => k !== 'created_at' && k !== 'updated_at' && k !== 'sort_order') as [key, val]}
                                    {#if val !== null && val !== undefined && val !== ''}
                                      <div><span class="modal-label">{key.replace(/_/g, ' ')}</span><span class="modal-value text-xs">{typeof val === 'object' ? JSON.stringify(val) : val}</span></div>
                                    {/if}
                                  {/each}
                                </div>
                                {@const curRels = current.data.relationships || {}}
                                {@const curRelEntries = Object.entries(curRels).filter(([k,v]) => v?.data && (Array.isArray(v.data) ? v.data.length > 0 : true))}
                                {#if curRelEntries.length > 0}
                                  <div class="surf-rels">
                                    {#each curRelEntries as [relName, relVal]}
                                      <button class="surf-rel-btn" on:click|stopPropagation={() => fetchRelationship(current.data, relName)}>{relName}</button>
                                    {/each}
                                  </div>
                                {/if}
                              {/if}
                              <details>
                                <summary class="text-xs opacity-50 cursor-pointer">Raw JSON</summary>
                                <pre class="surf-json">{JSON.stringify(current.data, null, 2)}</pre>
                              </details>
                            {/if}
                          </div>
                        {:else}
                          <!-- Normal card view -->
                          <div class="surf-card">
                            <div class="surf-header">
                              <span class="text-xs font-semibold opacity-60">{sub.label}</span>
                              <span class="text-sm font-semibold">{attrs.name || sub.r.id?.substring(0,12)}</span>
                              <span class="text-xs opacity-50 font-mono">{sub.r.type}:{sub.r.id?.substring(0,16)}</span>
                            </div>
                            {#if relEntries.length > 0}
                              <div class="surf-rels">
                                {#each relEntries as [relName, relVal]}
                                  <button class="surf-rel-btn" on:click|stopPropagation={() => { startSurf(sub.r.id, sub.r); fetchRelationship(sub.r, relName) }}>{relName}</button>
                                {/each}
                              </div>
                            {/if}
                            <details>
                              <summary class="text-xs opacity-50 cursor-pointer hover:opacity-80">Full JSON</summary>
                              <pre class="surf-json">{JSON.stringify(sub.r, (key, val) => key === 'links' ? undefined : val, 2)}</pre>
                            </details>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  </details>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}

  <!-- Compare View -->
  {:else if view === "compare"}
    <div>
      <button class="agw-btn agw-btn-ghost agw-btn-sm mb-4" on:click={() => (view = "account")}>
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
        <div class="agw-alert agw-alert-error">
          <Icon icon="solar:danger-circle-bold" width="20" height="20" />
          <span>{compareError}</span>
        </div>
      {:else}
        {@const totalReview = reviewSkan.length + reviewAw.length}

        <!-- Summary cards -->
        <div class="compare-stats">
          <div class="stat-card agw-card bg-base-200"><div class="stat-card-value">{agskanFields.length}</div><div class="stat-card-label">AgSKAN</div></div>
          <div class="stat-card agw-card bg-base-200"><div class="stat-card-value">{agworldFields.length}</div><div class="stat-card-label">Agworld</div></div>
          <div class="stat-card bg-base-200" style="background:rgba(34,197,94,0.1)"><div class="stat-card-value" style="color:#4ade80">{identicalPairs.length + basicallyIdenticalPairs.length}</div><div class="stat-card-label">Matched</div></div>
          <div class="stat-card bg-base-200" style="background:rgba(59,130,246,0.1)"><div class="stat-card-value" style="color:#60a5fa">{autoImportedSkan.length + autoImportedAw.length}</div><div class="stat-card-label">Imported</div></div>
          <div class="stat-card bg-base-200" style="background:rgba(245,158,11,0.1)"><div class="stat-card-value" style="color:#fbbf24">{totalReview}</div><div class="stat-card-label">Review</div></div>
          <div class="stat-card bg-base-200" style="background:rgba(168,85,247,0.1)"><div class="stat-card-value" style="color:#c084fc">{consolidatedFields.length}</div><div class="stat-card-label">Consolidated</div></div>
        </div>

        <!-- API Logs (collapsed by default) -->
        {#if compareLogs.length > 0}
          <details class="mb-3">
            <summary class="text-xs opacity-60 cursor-pointer hover:opacity-80">
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
            <button class="agw-btn agw-btn-accent agw-btn-sm mb-5" on:click={() => reviewOverlayDismissed = false}>
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
                    <button class="btn btn-sm btn-success w-full whitespace-nowrap" disabled={proposalType === "split" && isSplitAction && selectedOverlayIds.length === 0} on:click={confirmProposal}>
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
                      <td><span class="agw-badge agw-badge-sm agw-badge-outline">{cf.category}</span></td>
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
          <div class="flex gap-2 mb-6 flex-wrap">
            <button class="agw-btn agw-btn-ghost agw-btn-sm" on:click={() => showConsolidatedPreview = true}>
              <Icon icon="solar:map-point-bold" width="14" height="14" class="mr-1" /> View Fullscreen Map
            </button>
            <button class="agw-btn agw-btn-primary agw-btn-sm" on:click={saveConsolidationMetadata} disabled={savingConsolidated}>
              <Icon icon="solar:diskette-bold" width="14" height="14" class="mr-1" /> Save Consolidation
            </button>
            <button class="agw-btn agw-btn-danger agw-btn-sm" on:click={undoConsolidationSave} disabled={savingConsolidated}>
              {#if savingConsolidated}
                <span class="loading loading-spinner loading-xs"></span> Restoring...
              {:else}
                <Icon icon="solar:undo-left-round-bold" width="14" height="14" class="mr-1" /> Undo Save
              {/if}
            </button>
          </div>
          {#if saveResults}
            <div class="alert {saveResults.errors.length > 0 ? 'alert-warning' : 'alert-success'} mb-6 text-sm">
              <Icon icon={saveResults.errors.length > 0 ? 'solar:danger-triangle-bold' : 'solar:check-circle-bold'} width="20" height="20" />
              <div>
                <p>{saveResults.updated} fields restored to original state.</p>
                {#if saveResults.errors.length > 0}
                  <p class="text-xs opacity-70 mt-1">{saveResults.errors.length} errors:</p>
                  <ul class="text-xs opacity-70 list-disc list-inside">
                    {#each saveResults.errors as err, i (i)}<li class="truncate">{err}</li>{/each}
                  </ul>
                {/if}
              </div>
            </div>
          {/if}
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

<style>
  /* ── Records tab styling (matches /account/records) ── */
  .agworld-records {
    padding: 24px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    gap: 16px;
    flex-wrap: wrap;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-left h1 {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
  }
  .header-subtitle {
    font-size: 14px;
    color: oklch(var(--contrast-content) / 0.55);
    margin: 3px 0 0 0;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .action-btn-accent {
    background: rgba(37, 99, 235, 0.1);
    border-color: rgba(37, 99, 235, 0.18);
    color: #2563eb;
  }
  .action-btn-accent:hover:not(:disabled) { background: rgba(37, 99, 235, 0.18); }
  .action-btn-primary {
    background: rgba(22, 163, 74, 0.12);
    border-color: rgba(22, 163, 74, 0.18);
    color: #16a34a;
  }
  .action-btn-primary:hover:not(:disabled) { background: rgba(22, 163, 74, 0.2); }
  .action-btn-danger {
    background: rgba(220, 38, 38, 0.08);
    border-color: rgba(220, 38, 38, 0.12);
    color: #dc2626;
  }
  .action-btn-danger:hover:not(:disabled) { background: rgba(220, 38, 38, 0.15); }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .count-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.15);
    border-radius: 8px;
    font-size: 12px;
    color: oklch(var(--contrast-content) / 0.7);
  }

  /* Filters */
  .filters-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    align-items: center;
    flex-wrap: wrap;
  }
  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 200px;
    padding: 10px 14px;
    border-radius: 10px;
  }
  .search-box input {
    background: none;
    border: none;
    outline: none;
    color: oklch(var(--contrast-content));
    font-size: 15px;
    width: 100%;
  }
  .search-box input::placeholder { color: oklch(var(--contrast-content) / 0.4); }

  .year-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .year-chip {
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: oklch(var(--contrast-content) / 0.6);
    cursor: pointer;
    transition: all 0.2s;
  }
  .year-chip.active {
    background: oklch(var(--base-100));
    color: oklch(var(--contrast-content));
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    font-weight: 600;
  }
  .year-chip-clear { color: #f87171; }
  .year-chip:hover:not(.active) { color: oklch(var(--contrast-content) / 0.85); }

  /* Loading / Error / Empty */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 0;
    color: oklch(var(--contrast-content) / 0.5);
  }
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 0;
    color: oklch(var(--contrast-content) / 0.6);
    text-align: center;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 64px 0;
    text-align: center;
    color: oklch(var(--contrast-content) / 0.5);
  }
  .empty-subtitle {
    font-size: 13px;
    opacity: 0.7;
    max-width: 400px;
    margin: 0;
  }

  /* Grouped by farm */
  .fields-grouped {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .field-group {
    border-radius: 12px;
    overflow: hidden;
  }
  .field-group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .field-group-header:hover { background: oklch(var(--base-300) / 0.3); }
  .field-group-info {
    flex: 1;
    min-width: 0;
  }
  .field-group-name {
    font-size: 16px;
    font-weight: 700;
    display: block;
    color: oklch(var(--contrast-content));
  }
  .field-group-count {
    font-size: 13px;
    color: oklch(var(--contrast-content) / 0.55);
  }
  .expand-icon {
    color: oklch(var(--contrast-content) / 0.4);
    flex-shrink: 0;
  }

  .field-group-fields {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 12px 12px;
  }

  /* Field cards */
  .field-card {
    border-radius: 10px;
    overflow: hidden;
    transition: box-shadow 0.2s;
  }
  .field-card.selected { border-color: rgba(59, 130, 246, 0.4); }
  .field-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .field-card-header:hover { background: oklch(var(--base-200) / 0.5); }
  .field-thumb-wrap {
    flex-shrink: 0;
    cursor: pointer;
    border-radius: 6px;
    overflow: hidden;
    transition: opacity 0.15s;
  }
  .field-thumb-wrap:hover { opacity: 0.8; }
  .field-card-info {
    flex: 1;
    min-width: 0;
  }
  .field-card-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: oklch(var(--contrast-content));
  }
  .field-card-meta {
    font-size: 13px;
    color: oklch(var(--contrast-content) / 0.6);
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
  }
  .crop-badge {
    background: rgba(22, 163, 74, 0.12);
    color: #16a34a;
    padding: 2px 8px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
  }
  .year-tag {
    color: oklch(var(--contrast-content) / 0.4);
    font-size: 10px;
  }
  .field-card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .record-count-badge {
    font-size: 12px;
    color: oklch(var(--contrast-content) / 0.5);
    background: oklch(var(--base-300) / 0.4);
    padding: 3px 9px;
    border-radius: 6px;
    font-weight: 500;
  }
  .map-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    color: #60a5fa;
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.15);
    cursor: pointer;
    transition: all 0.15s;
  }
  .map-btn:hover { background: rgba(59, 130, 246, 0.15); }

  /* Records inside field */
  .field-records {
    border-top: 1px solid oklch(var(--base-300));
    padding: 6px 14px 10px;
  }
  .record-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 7px 0;
    border-bottom: 1px solid oklch(var(--base-300) / 0.4);
    font-size: 13px;
  }
  .record-row:last-child { border-bottom: none; }
  .record-date {
    color: oklch(var(--contrast-content) / 0.7);
    min-width: 90px;
    font-size: 13px;
    font-weight: 500;
  }
  .record-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    color: oklch(var(--contrast-content) / 0.65);
    min-width: 90px;
    font-size: 13px;
  }
  .record-stat {
    font-family: monospace;
    font-size: 13px;
    color: oklch(var(--contrast-content) / 0.7);
    min-width: 75px;
    font-weight: 500;
  }
  .record-method {
    margin-left: auto;
    font-size: 10px;
    color: oklch(var(--contrast-content) / 0.3);
    font-style: italic;
  }

  /* Activity button */
  .activity-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    color: #a78bfa;
    background: rgba(139, 92, 246, 0.08);
    border: 1px solid rgba(139, 92, 246, 0.15);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .activity-btn:hover { background: rgba(139, 92, 246, 0.15); }
  .activity-btn.loading { opacity: 0.7; pointer-events: none; }
  .activity-btn.has-data { border-color: rgba(34, 197, 94, 0.3); }
  .activity-btn.synced { border-color: rgba(34, 197, 94, 0.2); }
  .activity-btn-badge {
    font-size: 10px;
    font-weight: 700;
    background: rgba(139, 92, 246, 0.2);
    color: #a78bfa;
    padding: 1px 5px;
    border-radius: 4px;
    min-width: 16px;
    text-align: center;
  }
  .activity-btn.has-data .activity-btn-badge,
  .activity-btn.synced .activity-btn-badge {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }

  /* Agworld Activity section */
  .field-activity {
    border-top: 1px solid oklch(var(--base-300));
    padding: 8px 14px 10px;
    background: oklch(var(--base-200) / 0.3);
  }
  .activity-error {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #f87171;
    font-size: 12px;
    padding: 4px 0;
  }
  .activity-empty {
    color: oklch(var(--contrast-content) / 0.4);
    font-size: 12px;
    font-style: italic;
    padding: 4px 0;
  }
  .activity-group {
    margin-bottom: 8px;
  }
  .activity-group:last-child { margin-bottom: 0; }
  .activity-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: oklch(var(--contrast-content) / 0.5);
    margin-bottom: 4px;
  }
  .activity-count {
    font-size: 10px;
    background: oklch(var(--base-300) / 0.4);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
    color: oklch(var(--contrast-content) / 0.6);
  }
  .activity-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid oklch(var(--base-300) / 0.25);
    font-size: 12px;
  }
  .activity-row:last-child { border-bottom: none; }
  .activity-date {
    color: oklch(var(--contrast-content) / 0.7);
    min-width: 80px;
    font-size: 12px;
    font-weight: 500;
  }
  .activity-type-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    min-width: 48px;
    text-align: center;
  }
  .activity-type-badge.actual { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
  .activity-type-badge.work-order { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
  .activity-type-badge.plan { background: rgba(59, 130, 246, 0.12); color: #60a5fa; }
  .activity-type-badge.discarded-plan { background: rgba(255,255,255,0.05); color: oklch(var(--contrast-content) / 0.3); }

  .overdue-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }

  .activity-row.discarded { opacity: 0.5; }
  .activity-row.discarded:hover { opacity: 0.8; }
  .discarded-status { color: oklch(var(--contrast-content) / 0.3) !important; }
  .discarded-name { text-decoration: line-through; color: oklch(var(--contrast-content) / 0.4); }

  .activity-row { cursor: pointer; }
  .activity-row:hover { background: oklch(var(--base-200) / 0.3); }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.5);
    padding: 20px;
  }
  .modal-content {
    width: 100%;
    max-width: 560px;
    max-height: 85vh;
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 24px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .modal-title {
    font-size: 18px;
    font-weight: 700;
  }
  .modal-subtitle {
    font-size: 12px;
    color: inherit;
    opacity: 0.6;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .modal-close {
    background: none;
    border: none;
    color: inherit;
    opacity: 0.3;
    cursor: pointer;
    padding: 4px;
    border-radius: 8px;
    transition: opacity 0.15s;
  }
  .modal-close:hover { opacity: 0.7; }
  .modal-body {
    padding: 16px 24px 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .modal-section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: inherit;
    opacity: 0.5;
    margin-bottom: 2px;
  }
  .modal-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 16px;
  }
  .modal-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: inherit;
    opacity: 0.45;
    display: block;
  }
  .modal-value {
    font-size: 13px;
  }
  .modal-row {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .modal-attr-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 12px;
    margin: 2px 0 4px 12px;
    padding: 4px 8px;
    background: rgba(255,255,255,0.04);
    border-radius: 6px;
    font-size: 11px;
  }

  /* API Explorer */
  .surf-card {
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .surf-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .surf-rels {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }
  .surf-rel-btn {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.6);
    cursor: pointer;
    transition: all 0.15s;
  }
  .surf-rel-btn:hover {
    background: rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.3);
    color: #a78bfa;
  }
  .surf-json {
    font-size: 10px;
    padding: 6px;
    margin-top: 4px;
    background: rgba(255,255,255,0.04);
    border-radius: 4px;
    max-height: 200px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .activity-status {
    font-size: 10px;
    color: oklch(var(--contrast-content) / 0.5);
    min-width: 70px;
    text-transform: capitalize;
  }
  .activity-status.completed { color: #22c55e; }
  .activity-name {
    flex: 1;
    color: oklch(var(--contrast-content) / 0.8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Lifecycle: Plan → Actual */
  .activity-row.converted { background: rgba(34, 197, 94, 0.04); }
  .activity-lifecycle {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 80px;
    font-size: 10px;
  }
  .lifecycle-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .lifecycle-badge.plan { background: rgba(59, 130, 246, 0.12); color: #60a5fa; }
  .lifecycle-badge.actual { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
  .lifecycle-badge.discarded-plan { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }

  .activity-row.converted { background: rgba(34, 197, 94, 0.04); }
  .activity-row.discarded-converted { background: rgba(245, 158, 11, 0.04); }

  /* Activity banner */
  .activity-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    margin-bottom: 12px;
    background: rgba(139, 92, 246, 0.06);
    border: 1px solid rgba(139, 92, 246, 0.12);
    border-radius: 10px;
    font-size: 13px;
  }
  .activity-banner-info {
    display: flex;
    align-items: center;
    gap: 8px;
    color: oklch(var(--contrast-content) / 0.8);
  }
  .activity-btn-inline {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #a78bfa;
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.15);
  }

  /* ── Shared: Page wrapper ── */
  .agw-page {
    padding: 24px;
    max-width: 1000px;
    margin: 0 auto;
  }

  /* ── Shared: Card ── */
  .agw-card {
    border: 1px solid oklch(var(--base-300));
    border-radius: 12px;
    overflow: hidden;
  }
  .agw-card-body { padding: 16px; }
  .agw-card-title {
    font-size: 16px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
    color: oklch(var(--contrast-content));
  }

  /* ── Shared: Buttons ── */
  .agw-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid transparent;
    white-space: nowrap;
    background: none;
  }
  .agw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .agw-btn-primary {
    background: rgba(37, 99, 235, 0.1);
    border-color: rgba(37, 99, 235, 0.18);
    color: #2563eb;
  }
  .agw-btn-primary:hover:not(:disabled) { background: rgba(37, 99, 235, 0.18); }
  .agw-btn-accent {
    background: rgba(22, 163, 74, 0.1);
    border-color: rgba(22, 163, 74, 0.18);
    color: #16a34a;
  }
  .agw-btn-accent:hover:not(:disabled) { background: rgba(22, 163, 74, 0.18); }
  .agw-btn-danger {
    background: rgba(220, 38, 38, 0.08);
    border-color: rgba(220, 38, 38, 0.12);
    color: #dc2626;
  }
  .agw-btn-danger:hover:not(:disabled) { background: rgba(220, 38, 38, 0.15); }
  .agw-btn-ghost {
    color: oklch(var(--contrast-content) / 0.5);
    border: 1px solid oklch(var(--base-300));
  }
  .agw-btn-ghost:hover { color: oklch(var(--contrast-content) / 0.8); background: oklch(var(--base-300) / 0.3); }
  .agw-btn-xs { padding: 3px 10px; font-size: 11px; border-radius: 6px; }
  .agw-btn-sm { padding: 5px 12px; font-size: 12px; }

  /* ── Shared: Badges ── */
  .agw-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    background: oklch(var(--base-300) / 0.5);
    color: oklch(var(--contrast-content) / 0.7);
  }
  .agw-badge-sm { padding: 2px 8px; font-size: 11px; }
  .agw-badge-success { background: rgba(22, 163, 74, 0.15); color: #16a34a; }
  .agw-badge-info { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
  .agw-badge-warn { background: rgba(217, 119, 6, 0.12); color: #b45309; }
  .agw-badge-error { background: rgba(220, 38, 38, 0.12); color: #dc2626; }
  .agw-badge-outline {
    background: transparent;
    border: 1px solid oklch(var(--base-300) / 0.6);
    color: oklch(var(--contrast-content) / 0.6);
  }

  /* ── Shared: Form controls ── */
  .agw-input, .agw-select {
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid oklch(var(--base-300));
    background: oklch(var(--base-100));
    color: oklch(var(--contrast-content));
    font-size: 14px;
    outline: none;
    width: 100%;
    transition: border-color 0.2s;
  }
  .agw-input:focus, .agw-select:focus { border-color: rgba(59, 130, 246, 0.5); }
  .agw-input::placeholder { color: oklch(var(--contrast-content) / 0.35); }
  .agw-select option { background: oklch(var(--base-100)); color: oklch(var(--contrast-content)); }

  /* ── Shared: Alert ── */
  .agw-alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 10px;
    font-size: 13px;
  }
  .agw-alert-error { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.15); color: #f87171; }

  /* ── Shared: Tab navigation ── */
  .agw-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 20px;
    border-bottom: 2px solid oklch(var(--base-300));
  }
  .agw-tab {
    padding: 10px 20px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    color: oklch(var(--contrast-content) / 0.4);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .agw-tab.active {
    color: oklch(var(--contrast-content));
    border-bottom-color: oklch(var(--contrast-content));
  }
  .agw-tab:hover:not(.active) { color: oklch(var(--contrast-content) / 0.65); }

  /* ── Shared: Loading / Empty / Error ── */
  .agw-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 0;
    color: oklch(var(--contrast-content) / 0.4);
  }
  .agw-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 48px 24px;
    text-align: center;
    color: oklch(var(--contrast-content) / 0.45);
    border-radius: 12px;
  }
  .agw-empty-icon {
    opacity: 0.25;
    margin-bottom: 4px;
  }
  .agw-empty-title {
    font-size: 15px;
    font-weight: 600;
    color: oklch(var(--contrast-content) / 0.5);
  }
  .agw-empty-subtitle {
    font-size: 13px;
    max-width: 360px;
  }

  /* ── Account list cards ── */
  .acct-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
  }
  .acct-card {
    padding: 16px;
    cursor: pointer;
    transition: box-shadow 0.2s, border-color 0.2s;
  }
  .acct-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: oklch(var(--contrast-content) / 0.15); }
  .acct-card-name {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 6px;
    color: oklch(var(--contrast-content));
  }
  .acct-card-key {
    font-size: 12px;
    font-family: monospace;
    color: oklch(var(--contrast-content) / 0.5);
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .acct-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: oklch(var(--contrast-content) / 0.55);
  }

  /* ── Login view spinner ── */
  .agw-spinner {
    display: inline-block;
    width: 16px; height: 16px;
    border: 2px solid oklch(var(--base-300));
    border-top-color: #60a5fa;
    border-radius: 50%;
    animation: agw-spin 0.6s linear infinite;
  }
  @keyframes agw-spin { to { transform: rotate(360deg); } }

  /* ── API Explorer: query buttons ── */
  .query-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
    margin-top: 10px;
  }
  .query-btn {
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid oklch(var(--base-300));
    background: oklch(var(--base-100));
    color: oklch(var(--contrast-content) / 0.65);
    font-weight: 500;
  }
  .query-btn:hover { color: oklch(var(--contrast-content) / 0.95); border-color: rgba(59, 130, 246, 0.4); background: oklch(var(--base-200) / 0.5); }
  .query-btn.loading { opacity: 0.4; pointer-events: none; }

  /* ── API Explorer: log entries ── */
  .log-entry {
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid oklch(var(--base-300));
  }
  .log-summary {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
    background: none;
    border: none;
    color: oklch(var(--contrast-content));
    font-size: 12px;
  }
  .log-summary:hover { background: oklch(var(--base-100) / 0.5); }
  .log-detail {
    border-top: 1px solid oklch(var(--base-100));
    padding: 12px 14px;
  }

  /* ── Compare: summary stat cards ── */
  .compare-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }
  .stat-card {
    text-align: center;
    padding: 14px 8px;
    border-radius: 10px;
    border: 1px solid oklch(var(--base-300));
  }
  .stat-card-value {
    font-size: 24px;
    font-weight: 700;
  }
  .stat-card-label {
    font-size: 11px;
    color: oklch(var(--contrast-content) / 0.5);
    margin-top: 2px;
  }

  /* ── Compare: resolved items grid ── */
  .resolved-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
  }
  .resolved-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
  }
</style>
