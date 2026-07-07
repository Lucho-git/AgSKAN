// src/lib/stores/operatorStore.ts
import { writable } from "svelte/store"

export interface Operator {
  id: string
  name: string
  color: string
  is_active: boolean
  in_use_by?: string | null
}

export interface OperatorState {
  operator: Operator | null
  wasKicked: boolean
  previousOperatorName: string | null
  loading: boolean
  requiresSelection: boolean // true when operator must be chosen before trailing
}

const defaultState: OperatorState = {
  operator: null,
  wasKicked: false,
  previousOperatorName: null,
  loading: false,
  requiresSelection: false,
}

export const operatorStore = writable<OperatorState>(defaultState)

export function setOperator(op: Operator | null) {
  operatorStore.update((s) => ({
    ...s,
    operator: op,
    wasKicked: false,
    previousOperatorName: null,
    requiresSelection: false,
  }))
}

export function clearOperator() {
  operatorStore.set(defaultState)
}
