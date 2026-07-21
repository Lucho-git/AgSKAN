// src/lib/api/agworldApi.ts
// Client for the Agworld v3 API (JSON:API spec)

export const AGWORLD_INSTANCES: Record<string, { base: string; label: string }> = {
    au: { base: 'https://au.agworld.com', label: 'Australia' },
    us: { base: 'https://us.agworld.com', label: 'US' },
    nz: { base: 'https://nz.agworld.co', label: 'New Zealand' },
};

// --- Request log entry ---
export interface AgworldRequestLog {
    id: string;
    timestamp: string;
    method: string;
    url: string;
    apiVersion: 'v2' | 'v3';
    instance: string;
    requestHeaders: Record<string, string>;
    requestBody?: string;
    status?: number;
    statusText?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    error?: string;
    durationMs: number;
}

export interface AgworldAccount {
    id: string;
    name: string;
    apiKey: string;
    instance: string; // 'us' | 'au' | 'nz'
    growerId: string; // default grower ID for queries
    createdAt: string;
    linkedMapId?: string; // AgSKAN map_id this account's data should be compared against
    linkedProfileLabel?: string; // display label (email/name) of the linked AgSKAN customer
}

export interface AgworldGrower {
    type: 'growers';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
}

export interface AgworldFarm {
    type: 'farms';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
}

export interface AgworldField {
    type: 'fields';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
}

export interface AgworldFieldBoundary {
    type: 'field-boundaries';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
}

export interface AgworldFieldCrop {
    type: 'field-crops';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
}

export interface AgworldActual {
    type: 'actuals';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
}

export interface AgworldObservation {
    type: 'observations';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
}

export interface AgworldCropVariety {
    type: 'crop_varieties';
    id: string;
    attributes: Record<string, any>;
    links: Record<string, any>;
}

export interface AgworldOperation {
    type: 'operations';
    id: string;
    attributes: Record<string, any>;
    links: Record<string, any>;
}

export interface AgworldFrame {
    type: 'frames';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
    links: Record<string, any>;
}

export interface AgworldLayer {
    type: 'layers';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
    links: Record<string, any>;
}

export interface AgworldPrescription {
    type: 'prescriptions';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
    links: Record<string, any>;
}

export interface AgworldProduct {
    type: 'products';
    id: string;
    attributes: Record<string, any>;
    links: Record<string, any>;
}

export interface AgworldStockItemEvent {
    type: 'stock_item_events';
    id: string;
    attributes: Record<string, any>;
    relationships: Record<string, any>;
    links: Record<string, any>;
}

export interface AgworldUser {
    type: 'users';
    id: string;
    attributes: Record<string, any>;
    links: Record<string, any>;
}

export interface AgworldCollectionResponse<T> {
    data: T[];
    links?: {
        self?: string;
        first?: string;
        last?: string;
        next?: string;
        prev?: string;
    };
    meta?: Record<string, any>;
}

export interface AgworldSingleResponse<T> {
    data: T;
    links?: {
        self?: string;
    };
}

// --- Local storage helpers for dev accounts ---

const STORAGE_KEY = 'agskan_agworld_accounts';

function loadAccounts(): AgworldAccount[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        // Migrate old accounts without instance field
        return (Array.isArray(parsed) ? parsed : []).map((a: any) => ({
            ...a,
            instance: a.instance || 'au',
            growerId: a.growerId || '',
        }));
    } catch {
        return [];
    }
}

function saveAccounts(accounts: AgworldAccount[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export const agworldAccountStore = {
    getAll(): AgworldAccount[] {
        return loadAccounts();
    },

    getById(id: string): AgworldAccount | undefined {
        return loadAccounts().find((a) => a.id === id);
    },

    add(name: string, apiKey: string, instance: string, growerId: string): AgworldAccount {
        const accounts = loadAccounts();
        const account: AgworldAccount = {
            id: crypto.randomUUID(),
            name,
            apiKey,
            instance: instance || 'au',
            growerId: growerId || '',
            createdAt: new Date().toISOString(),
        };
        accounts.push(account);
        saveAccounts(accounts);
        return account;
    },

    remove(id: string): void {
        const accounts = loadAccounts().filter((a) => a.id !== id);
        saveAccounts(accounts);
    },

    update(id: string, patch: Partial<Pick<AgworldAccount, 'name' | 'apiKey' | 'instance' | 'growerId' | 'linkedMapId' | 'linkedProfileLabel'>>): AgworldAccount | null {
        const accounts = loadAccounts();
        const idx = accounts.findIndex((a) => a.id === id);
        if (idx === -1) return null;
        accounts[idx] = { ...accounts[idx], ...patch };
        saveAccounts(accounts);
        return accounts[idx];
    },
};

// --- Core fetch with logging ---

export type AgworldFetchResult<T> = {
    success: boolean;
    data?: T;
    error?: string;
    status?: number;
    log: AgworldRequestLog;
};

function buildRequestLog(
    method: string,
    url: string,
    apiVersion: 'v2' | 'v3',
    instance: string,
    reqHeaders: Record<string, string>,
    reqBody?: string,
): AgworldRequestLog {
    return {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        method,
        url,
        apiVersion,
        instance,
        requestHeaders: { ...reqHeaders },
        requestBody: reqBody,
        durationMs: 0,
    };
}

async function agworldFetch<T>(
    account: AgworldAccount,
    path: string,
    params?: Record<string, string>,
): Promise<AgworldFetchResult<T>> {
    const instanceConfig = AGWORLD_INSTANCES[account.instance] || AGWORLD_INSTANCES.au;

    // In dev mode, route through Vite proxy to bypass CORS.
    const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
    let url: URL;
    let displayUrl: string;

    if (isDev) {
        const proxyPath = `/agworld-v3-proxy/${account.instance}${path}`;
        url = new URL(proxyPath, window.location.origin);
        displayUrl = `${instanceConfig.base}${path}`;
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== '') url.searchParams.set(k, v);
            });
        }
    } else {
        url = new URL(`${instanceConfig.base}${path}`);
        displayUrl = url.toString();
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== '') url.searchParams.set(k, v);
            });
        }
    }

    const requestHeaders: Record<string, string> = {
        'Authorization': `API-Key ${account.apiKey}`,
        'Accept': 'application/vnd.api+json',
    };

    // Log the actual target URL (not the proxy URL) for transparency
    const log = buildRequestLog('GET', displayUrl, 'v3', account.instance, requestHeaders);
    const startTime = performance.now();

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: requestHeaders,
        });

        log.durationMs = Math.round(performance.now() - startTime);
        log.status = response.status;
        log.statusText = response.statusText;

        // Capture response headers
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((val, key) => {
            respHeaders[key] = val;
        });
        log.responseHeaders = respHeaders;

        // Read response body
        const bodyText = await response.text().catch(() => '');
        log.responseBody = bodyText.length > 50000
            ? bodyText.substring(0, 50000) + '... (truncated)'
            : bodyText;

        if (!response.ok) {
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
                status: response.status,
                log,
            };
        }

        // Parse JSON:API response
        let data: T;
        try {
            data = JSON.parse(bodyText) as T;
        } catch (parseErr: any) {
            return {
                success: false,
                error: `Failed to parse JSON response: ${parseErr.message}`,
                status: response.status,
                log,
            };
        }

        return { success: true, data, status: response.status, log };
    } catch (err: any) {
        log.durationMs = Math.round(performance.now() - startTime);
        log.error = err.message || 'Network error';
        return {
            success: false,
            error: `Network error: ${err.message || 'Failed to fetch'}`,
            log,
        };
    }
}

// --- Build params helpers ---

function buildListParams(options?: {
    page?: { number?: number; size?: number };
    sort?: string;
    filter?: Record<string, string>;
    fields?: string;
    paginationLinks?: boolean;
}): Record<string, string> {
    const p: Record<string, string> = {};
    if (options?.page?.number) p['page[number]'] = String(options.page.number);
    if (options?.page?.size) p['page[size]'] = String(options.page.size);
    if (options?.sort) p['sort'] = options.sort;
    if (options?.filter) {
        Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
    }
    if (options?.paginationLinks) p['pagination_links'] = 'true';
    return p;
}

// ============================================================
//  API — v2 endpoints
// ============================================================

export const agworldApiV2 = {
    /** Fetch the currently authenticated user */
    async getUser(account: AgworldAccount) {
        return agworldFetch<AgworldSingleResponse<AgworldUser>>(account, 'v2', '/api/user');
    },

    async listGrowers(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[growers]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldGrower>>(account, 'v2', '/api/growers', p);
    },

    async getGrower(account: AgworldAccount, growerId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[growers]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldGrower>>(account, 'v2', `/api/growers/${growerId}`, p);
    },

    async listFarms(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
        include?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[farms]'] = options.fields;
        if (options?.include) p['include'] = options.include;
        return agworldFetch<AgworldCollectionResponse<AgworldFarm>>(account, 'v2', '/api/farms', p);
    },

    async getFarm(account: AgworldAccount, farmId: string, options?: { fields?: string; include?: string }) {
        const p: Record<string, string> = {};
        if (options?.fields) p['fields[farms]'] = options.fields;
        if (options?.include) p['include'] = options.include;
        return agworldFetch<AgworldSingleResponse<AgworldFarm>>(account, 'v2', `/api/farms/${farmId}`, p);
    },

    async listFields(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
        include?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[fields]'] = options.fields;
        if (options?.include) p['include'] = options.include;
        return agworldFetch<AgworldCollectionResponse<AgworldField>>(account, 'v2', '/api/fields', p);
    },

    async getField(account: AgworldAccount, fieldId: string, options?: { fields?: string; include?: string }) {
        const p: Record<string, string> = {};
        if (options?.fields) p['fields[fields]'] = options.fields;
        if (options?.include) p['include'] = options.include;
        return agworldFetch<AgworldSingleResponse<AgworldField>>(account, 'v2', `/api/fields/${fieldId}`, p);
    },

    async listFieldBoundaries(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[field_boundaries]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldFieldBoundary>>(account, 'v2', '/api/field_boundaries', p);
    },

    async getFieldBoundary(account: AgworldAccount, boundaryId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[field_boundaries]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldFieldBoundary>>(account, 'v2', `/api/field_boundaries/${boundaryId}`, p);
    },

    async listFieldCrops(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[field_crops]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldFieldCrop>>(account, 'v2', '/api/field_crops', p);
    },

    async getFieldCrop(account: AgworldAccount, cropId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[field_crops]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldFieldCrop>>(account, 'v2', `/api/field_crops/${cropId}`, p);
    },

    // --- Crop Varieties ---
    async getCropVariety(account: AgworldAccount, varietyId: string) {
        return agworldFetch<AgworldSingleResponse<AgworldCropVariety>>(account, 'v2', `/api/crop_varieties/${varietyId}`);
    },

    // --- Operations ---
    async getOperation(account: AgworldAccount, operationId: string) {
        return agworldFetch<AgworldSingleResponse<AgworldOperation>>(account, 'v2', `/api/operations/${operationId}`);
    },

    // --- Active Ingredient Amounts ---
    async listActiveIngredientAmounts(account: AgworldAccount, growerId: string, options?: {
        filter?: Record<string, string>;
    }) {
        const p: Record<string, string> = {};
        if (options?.filter) {
            Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        }
        return agworldFetch<any>(account, 'v2', `/api/growers/${growerId}/active_ingredient_amounts`, p);
    },

    // --- Frames ---
    async listFrames(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
    }) {
        const p = buildListParams(options);
        if (options?.filter) {
            Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        }
        return agworldFetch<AgworldCollectionResponse<AgworldFrame>>(account, 'v2', '/api/frames', p);
    },

    async getFrame(account: AgworldAccount, frameId: string) {
        return agworldFetch<AgworldSingleResponse<AgworldFrame>>(account, 'v2', `/api/frames/${frameId}`);
    },

    // --- Layers ---
    async listLayers(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
    }) {
        const p = buildListParams(options);
        if (options?.filter) {
            Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        }
        return agworldFetch<AgworldCollectionResponse<AgworldLayer>>(account, 'v2', '/api/layers', p);
    },

    async getLayer(account: AgworldAccount, layerId: string) {
        return agworldFetch<AgworldSingleResponse<AgworldLayer>>(account, 'v2', `/api/layers/${layerId}`);
    },

    // --- Business Summaries (CSV, use api_token query param) ---
    async getBusinessCosts(account: AgworldAccount, options?: {
        cost_type?: 'planned' | 'forecast_remaining' | 'actual';
        date_grouping?: 'day' | 'week' | 'month' | 'year';
        units_of_measurement?: 'metric' | 'imperial';
    }) {
        const p: Record<string, string> = { api_token: account.apiKey.replace(/^v1_/, '') };
        if (options?.cost_type) p['cost_type'] = options.cost_type;
        if (options?.date_grouping) p['date_grouping'] = options.date_grouping;
        if (options?.units_of_measurement) p['units_of_measurement'] = options.units_of_measurement;
        return agworldFetch<any>(account, 'v2', '/api/business_summaries/costs', p);
    },

    async getFieldCropAreas(account: AgworldAccount, options?: {
        units_of_measurement?: 'metric' | 'imperial';
    }) {
        const p: Record<string, string> = { api_token: account.apiKey.replace(/^v1_/, '') };
        if (options?.units_of_measurement) p['units_of_measurement'] = options.units_of_measurement;
        return agworldFetch<any>(account, 'v2', '/api/business_summaries/field_crop_areas', p);
    },

    async getRevenues(account: AgworldAccount, options?: {
        revenue_type?: 'planned' | 'actual';
        units_of_measurement?: 'metric' | 'imperial';
        use_crop_specific_masses?: boolean;
    }) {
        const p: Record<string, string> = { api_token: account.apiKey.replace(/^v1_/, '') };
        if (options?.revenue_type) p['revenue_type'] = options.revenue_type;
        if (options?.units_of_measurement) p['units_of_measurement'] = options.units_of_measurement;
        if (options?.use_crop_specific_masses !== undefined) p['use_crop_specific_masses'] = String(options.use_crop_specific_masses);
        return agworldFetch<any>(account, 'v2', '/api/business_summaries/revenues', p);
    },

    // --- Prescriptions ---
    async listPrescriptions(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
    }) {
        const p = buildListParams(options);
        if (options?.filter) {
            Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        }
        return agworldFetch<AgworldCollectionResponse<AgworldPrescription>>(account, 'v2', '/api/prescriptions', p);
    },

    async getPrescription(account: AgworldAccount, prescriptionId: string) {
        return agworldFetch<AgworldSingleResponse<AgworldPrescription>>(account, 'v2', `/api/prescriptions/${prescriptionId}`);
    },

    // --- Products ---
    async getProduct(account: AgworldAccount, productId: string) {
        return agworldFetch<AgworldSingleResponse<AgworldProduct>>(account, 'v2', `/api/products/${productId}`);
    },

    // --- Stock Item Events ---
    async listStockItemEvents(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, any>;
    }) {
        const p: Record<string, string> = {};
        if (options?.page?.number) p['page[number]'] = String(options.page.number);
        if (options?.page?.size) p['page[size]'] = String(options.page.size);
        if (options?.filter) {
            Object.entries(options.filter).forEach(([k, v]) => {
                if (typeof v === 'object' && v !== null) {
                    // Nested filter like filter[event_date][after]
                    Object.entries(v as Record<string, string>).forEach(([nk, nv]) => {
                        p[`filter[${k}][${nk}]`] = nv;
                    });
                } else {
                    p[`filter[${k}]`] = String(v);
                }
            });
        }
        return agworldFetch<AgworldCollectionResponse<AgworldStockItemEvent>>(account, 'v2', '/api/stock_item_events', p);
    },
};

// ============================================================
//  API — v3 endpoints
// ============================================================

export const agworldApiV3 = {
    async listGrowers(account: AgworldAccount, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
        paginationLinks?: boolean;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[growers]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldGrower>>(account, '/api/v3/growers', p);
    },

    async getGrower(account: AgworldAccount, growerId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[growers]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldGrower>>(account, `/api/v3/growers/${growerId}`, p);
    },

    async listFarms(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[farms]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldFarm>>(account, `/api/v3/growers/${growerId}/farms`, p);
    },

    async getFarm(account: AgworldAccount, growerId: string, farmId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[farms]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldFarm>>(account, `/api/v3/growers/${growerId}/farms/${farmId}`, p);
    },

    async listFields(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[fields]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldField>>(account, `/api/v3/growers/${growerId}/fields`, p);
    },

    async getField(account: AgworldAccount, growerId: string, fieldId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[fields]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldField>>(account, `/api/v3/growers/${growerId}/fields/${fieldId}`, p);
    },

    async listFieldBoundaries(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[field-boundaries]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldFieldBoundary>>(account, `/api/v3/growers/${growerId}/field-boundaries`, p);
    },

    async getFieldBoundary(account: AgworldAccount, growerId: string, boundaryId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[field-boundaries]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldFieldBoundary>>(account, `/api/v3/growers/${growerId}/field-boundaries/${boundaryId}`, p);
    },

    async listFieldCrops(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[field-crops]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldFieldCrop>>(account, `/api/v3/growers/${growerId}/field-crops`, p);
    },

    async getFieldCrop(account: AgworldAccount, growerId: string, cropId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[field-crops]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldFieldCrop>>(account, `/api/v3/growers/${growerId}/field-crops/${cropId}`, p);
    },

    async listActuals(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[actuals]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldActual>>(account, `/api/v3/growers/${growerId}/actuals`, p);
    },

    async getActual(account: AgworldAccount, growerId: string, actualId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[actuals]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldActual>>(account, `/api/v3/growers/${growerId}/actuals/${actualId}`, p);
    },

    async listObservations(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.fields) p['fields[observations]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldObservation>>(account, `/api/v3/growers/${growerId}/observations`, p);
    },

    async getObservation(account: AgworldAccount, growerId: string, observationId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[observations]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldObservation>>(account, `/api/v3/growers/${growerId}/observations/${observationId}`, p);
    },

    // --- Plans ---
    async listPlans(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[plan]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/plans`, p);
    },

    async getPlan(account: AgworldAccount, growerId: string, planId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[plan]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/plans/${planId}`, p);
    },

    // --- Recommendations ---
    async listRecommendations(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[recommendations]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/recommendations`, p);
    },

    async getRecommendation(account: AgworldAccount, growerId: string, recId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[recommendations]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/recommendations/${recId}`, p);
    },

    // --- Work Orders ---
    async listWorkOrders(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        sort?: string;
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[work-order]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/work-orders`, p);
    },

    async getWorkOrder(account: AgworldAccount, growerId: string, woId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[work-order]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/work-orders/${woId}`, p);
    },

    // --- Users ---
    async getCurrentUser(account: AgworldAccount, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[users]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldUser>>(account, '/api/v3/users/me', p);
    },

    async getUser(account: AgworldAccount, userId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[users]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldUser>>(account, `/api/v3/users/${userId}`, p);
    },

    // --- Operators ---
    async listOperators(account: AgworldAccount, options?: { page?: { number?: number; size?: number }; filter?: Record<string, string>; fields?: string }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[operators]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, '/api/v3/operators', p);
    },

    // --- Organizations ---
    async getOrganization(account: AgworldAccount, orgId: string, fields?: string) {
        const p: Record<string, string> = {};
        if (fields) p['fields[organizations]'] = fields;
        return agworldFetch<AgworldSingleResponse<AgworldResource>>(account, `/api/v3/organizations/${orgId}`, p);
    },

    // --- Data Catalogs ---
    async searchCropVarieties(account: AgworldAccount, q: string, fields?: string) {
        const p: Record<string, string> = { q };
        if (fields) p['fields[crop-varieties]'] = fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, '/api/v3/crop-varieties', p);
    },

    async searchProducts(account: AgworldAccount, q: string, options?: { filter?: Record<string, string>; fields?: string }) {
        const p: Record<string, string> = { q };
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[products]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, '/api/v3/products', p);
    },

    // --- Activity Sub-resources ---
    async listActivityOperations(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[activity-operations]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/activity-operations`, p);
    },

    async listActivityProductApplications(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[activity-product-applications]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/activity-product-applications`, p);
    },

    async listActivitySeedings(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[activity-seedings]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/activity-seedings`, p);
    },

    async listActivityWeatherRecords(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[activity-weather-records]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/activity-weather-records`, p);
    },

    async listActivityAssets(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[activity-assets]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/activity-assets`, p);
    },

    async listActivityProblems(account: AgworldAccount, growerId: string, options?: {
        page?: { number?: number; size?: number };
        filter?: Record<string, string>;
        fields?: string;
    }) {
        const p = buildListParams(options);
        if (options?.filter) Object.entries(options.filter).forEach(([k, v]) => { p[`filter[${k}]`] = v; });
        if (options?.fields) p['fields[activity-problems]'] = options.fields;
        return agworldFetch<AgworldCollectionResponse<AgworldResource>>(account, `/api/v3/growers/${growerId}/activity-problems`, p);
    },
};
