// A minimal stand-in for the supabase-js client, for unit tests.
//
// Every query chain (`from(table).select().eq()...`) records what was called and
// resolves to whatever the test registered for that table + operation:
//
//   const sb = createFakeSupabase()
//   sb.respond("profiles", "select", { data: null, error: { code: "PGRST116" } })
//   sb.respond("profiles", "insert", { error: null })
//   ...
//   expect(sb.calls("profiles", "insert")[0].payload).toMatchObject({ id: "u1" })
//
// A response can also be a function of the recorded call, so filters can be
// inspected (e.g. answer differently per `eq("trail_id", ...)`).

type Op = "select" | "insert" | "update" | "delete" | "upsert" | "rpc"

export interface FakeCall {
  table: string
  op: Op
  payload?: unknown
  filters: Array<[string, ...unknown[]]>
}

type Result = { data?: unknown; error?: unknown; count?: number }
type Responder = Result | ((call: FakeCall) => Result)

export function createFakeSupabase() {
  const responders = new Map<string, Responder[]>()
  const log: FakeCall[] = []

  const key = (table: string, op: Op) => `${table}:${op}`

  function resolve(call: FakeCall): Result {
    const list = responders.get(key(call.table, call.op))
    if (!list || list.length === 0) return { data: null, error: null }
    // Queue semantics: use responses in order, keep repeating the last one.
    const r = list.length > 1 ? list.shift()! : list[0]
    return typeof r === "function" ? r(call) : r
  }

  function builder(table: string) {
    let call: FakeCall | null = null
    const start = (op: Op, payload?: unknown) => {
      // A select() after insert/update just shapes the returned row.
      if (call && op === "select") return chain
      call = { table, op, payload, filters: [] }
      log.push(call)
      return chain
    }
    const filter =
      (name: string) =>
      (...args: unknown[]) => {
        call?.filters.push([name, ...args])
        return chain
      }
    const chain: any = {
      select: (cols?: unknown) => start("select", cols),
      insert: (p: unknown) => start("insert", p),
      update: (p: unknown) => start("update", p),
      upsert: (p: unknown) => start("upsert", p),
      delete: () => start("delete"),
      eq: filter("eq"),
      neq: filter("neq"),
      is: filter("is"),
      in: filter("in"),
      gt: filter("gt"),
      lt: filter("lt"),
      order: filter("order"),
      limit: filter("limit"),
      single: filter("single"),
      maybeSingle: filter("maybeSingle"),
      then: (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(call!)).then(ok, fail),
    }
    return chain
  }

  return {
    from: (table: string) => builder(table),
    rpc: (fn: string, args?: unknown) => {
      const call: FakeCall = {
        table: fn,
        op: "rpc",
        payload: args,
        filters: [],
      }
      log.push(call)
      return Promise.resolve(resolve(call))
    },
    /** Register the response(s) for a table + operation. Several = used in order. */
    respond(table: string, op: Op, ...results: Responder[]) {
      responders.set(key(table, op), results)
    },
    /** Recorded calls, optionally narrowed to one table / operation. */
    calls(table?: string, op?: Op) {
      return log.filter(
        (c) => (!table || c.table === table) && (!op || c.op === op),
      )
    },
  }
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>
