// src/lib/api/operatorApi.ts
import { supabase } from "$lib/supabaseClient"
import { operatorStore, setOperator, type Operator } from "$lib/stores/operatorStore"
import { profileStore } from "$lib/stores/profileStore"
import { get } from "svelte/store"

/** Capitalize the first letter of each word, lowercase the rest */
function titleCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

export interface OperatorCheckResult {
  operator: Operator | null
  wasKicked: boolean
  previousOperatorName: string | null
}

export const operatorApi = {
  /**
   * Check the current account's operator status on the connected map.
   * Called on map load. Updates the operatorStore.
   */
  async checkOperatorStatus(mapId: string): Promise<OperatorCheckResult> {
    operatorStore.update((s) => ({ ...s, loading: true }))

    try {
      const { data, error } = await supabase.rpc("get_active_operator", {
        p_map_id: mapId,
      })

      // Always clear the operator and update with whatever the RPC returned
      // This ensures stale state is never preserved on error
      const row = data?.[0]
      const result: OperatorCheckResult = {
        operator: row?.out_operator_id
          ? {
              id: row.out_operator_id,
              name: row.out_operator_name,
              color: row.out_operator_color || "#60a5fa",
              is_active: row.out_is_active ?? true,
            }
          : null,
        wasKicked: row?.out_was_kicked ?? false,
        previousOperatorName: row?.out_previous_operator_name ?? null,
      }

      if (error) {
        console.error("[operatorApi] checkOperatorStatus RPC error:", error, "row:", row)
      }

      if (result.operator) {
        setOperator(result.operator)
      } else {
        operatorStore.update((s) => ({
          ...s,
          operator: null,
          wasKicked: result.wasKicked,
          previousOperatorName: result.previousOperatorName,
          loading: false,
          requiresSelection: true,
        }))
      }

      console.log("[operatorApi] checkOperatorStatus result:", result)
      return result
    } catch (e) {
      console.error("[operatorApi] checkOperatorStatus exception:", e)
      operatorStore.update((s) => ({
        ...s,
        operator: null,
        wasKicked: false,
        previousOperatorName: null,
        loading: false,
        requiresSelection: true,
      }))
      return { operator: null, wasKicked: false, previousOperatorName: null }
    }
  },

  /**
   * Get all operators on a map (for the picker list).
   */
  async getMapOperators(mapId: string): Promise<Operator[]> {
    try {
      // Fetch operators and active sessions separately (avoids nested RLS issues)
      const [operatorsResult, sessionsResult] = await Promise.all([
        supabase
          .from("map_operators")
          .select("id, name, color, is_active")
          .eq("map_id", mapId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("operator_sessions")
          .select("operator_id, account_id")
          .eq("map_id", mapId)
          .is("ended_at", null),
      ])

      if (operatorsResult.error) {
        console.error("[operatorApi] getMapOperators error:", operatorsResult.error)
        return []
      }

      // Build a map of operator_id → account_id for active sessions
      const activeSessions = new Map<string, string>()
      for (const s of sessionsResult.data || []) {
        activeSessions.set(s.operator_id, s.account_id)
      }

      // If we have active sessions, fetch the account names
      const accountIds = [...new Set(activeSessions.values())]
      let accountNames: Record<string, string> = {}
      if (accountIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", accountIds)
        for (const p of profilesData || []) {
          accountNames[p.id] = p.full_name
        }
      }

      return (operatorsResult.data || []).map((r) => {
        const activeAccountId = activeSessions.get(r.id)
        return {
          id: r.id,
          name: r.name,
          color: r.color || "#60a5fa",
          is_active: r.is_active,
          in_use_by: activeAccountId ? (accountNames[activeAccountId] || null) : null,
        }
      })
    } catch (e) {
      console.error("[operatorApi] getMapOperators exception:", e)
      return []
    }
  },

  /**
   * Create a new operator on the map, then select it.
   * Returns the new operator.
   */
  async createAndSelectOperator(mapId: string, name: string): Promise<Operator | null> {
    try {
      const { data: session } = await supabase.auth.getSession()
      const userId = session?.session?.user?.id
      if (!userId) return null

      // Auto-capitalize first letter of each word
      const normalizedName = titleCase(name.trim())

      // Create the operator
      const { data: newOp, error: createError } = await supabase
        .from("map_operators")
        .insert({
          map_id: mapId,
          name: normalizedName,
          created_by: userId,
        })
        .select("id, name, color, is_active")
        .single()

      if (createError) {
        // Maybe name already exists — try to find it
        if (createError.code === "23505") {
          const { data: existing } = await supabase
            .from("map_operators")
            .select("id, name, color, is_active")
            .eq("map_id", mapId)
            .eq("name", normalizedName)
            .single()

          if (existing) {
            return await this.selectOperator(existing.id, mapId)
          }
        }
        console.error("[operatorApi] createOperator error:", createError)
        return null
      }

      // Now select it
      return await this.selectOperator(newOp.id, mapId)
    } catch (e) {
      console.error("[operatorApi] createAndSelectOperator exception:", e)
      return null
    }
  },

  /**
   * Select an existing operator for the current account.
   * This kicks any other account that had this operator active.
   */
  async selectOperator(operatorId: string, mapId: string): Promise<Operator | null> {
    try {
      const { data, error } = await supabase.rpc("select_operator", {
        p_operator_id: operatorId,
        p_map_id: mapId,
      })

      if (error) {
        console.error("[operatorApi] selectOperator error:", error)
        return null
      }

      const op: Operator = {
        id: data.id,
        name: data.name,
        color: data.color || "#60a5fa",
        is_active: data.is_active,
      }

      setOperator(op)
      return op
    } catch (e) {
      console.error("[operatorApi] selectOperator exception:", e)
      return null
    }
  },

  /**
   * Get the current operator from the store, or null.
   */
  getCurrentOperator(): Operator | null {
    return get(operatorStore).operator
  },

  /**
   * Check if an operator is selected. Used as a gate before trailing.
   */
  hasOperator(): boolean {
    return get(operatorStore).operator !== null
  },
}
