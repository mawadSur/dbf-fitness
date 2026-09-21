/**
 * Minimal chainable Supabase stand-in for screen tests. Register a handler per table with
 * `setTable`; it receives what the screen asked for (method, filters, payload) and returns
 * `{ data, error }`. Not used by app code.
 */
export type FakeOps = {
  table: string;
  /** Set when the screen used `.single()` (0 rows => PGRST116) rather than `.maybeSingle()`. */
  single?: boolean;
  method: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  filters: [string, unknown][];
  payload?: unknown;
};
export type FakeResult = { data: unknown; error: Error | null };
type Handler = (ops: FakeOps) => FakeResult | Promise<FakeResult>;

/** A recorded `supabase.rpc(name, args)` call. */
export type FakeRpcCall = { name: string; args: unknown };
type RpcHandler = (args: unknown) => FakeResult | Promise<FakeResult>;

const handlers = new Map<string, Handler>();
const rpcHandlers = new Map<string, RpcHandler>();
export const fakeCalls: FakeOps[] = [];
export const fakeRpcCalls: FakeRpcCall[] = [];
let session: { user: { id: string } } | null = { user: { id: 'user-1' } };

export function resetFake() {
  handlers.clear();
  rpcHandlers.clear();
  fakeCalls.length = 0;
  fakeRpcCalls.length = 0;
  session = { user: { id: 'user-1' } };
}
export function setTable(table: string, handler: Handler) {
  handlers.set(table, handler);
}
/**
 * Register a stand-in for one SECURITY DEFINER function. An unregistered name
 * answers the way PostgREST does when the function is not deployed (PGRST202),
 * so a test that forgets to stub one fails loudly instead of silently
 * "succeeding" against a database that does not have it.
 */
export function setRpc(name: string, handler: RpcHandler) {
  rpcHandlers.set(name, handler);
}
export function setSession(next: { user: { id: string } } | null) {
  session = next;
}

function makeBuilder(table: string) {
  const ops: FakeOps = { table, method: 'select', filters: [] };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  // `gte`/`lt` are range filters (the workout-day screen bounds completed_at to the
  // current UTC day); they chain like `select` and are not recorded as `filters`.
  for (const name of ['select', 'order', 'limit', 'in', 'gte', 'lt']) builder[name] = chain;
  builder.eq = (column: string, value: unknown) => {
    ops.filters.push([column, value]);
    return builder;
  };
  for (const name of ['insert', 'update', 'upsert'] as const) {
    builder[name] = (payload: unknown) => {
      ops.method = name;
      ops.payload = payload;
      return builder;
    };
  }
  builder.delete = () => {
    ops.method = 'delete';
    return builder;
  };
  builder.single = () => {
    ops.single = true;
    return builder;
  };
  builder.maybeSingle = chain;
  builder.then = (resolve: (v: FakeResult) => unknown, reject: (e: unknown) => unknown) => {
    fakeCalls.push({ ...ops, filters: [...ops.filters] });
    const handler = handlers.get(table);
    const result = handler ? handler(ops) : { data: null, error: null };
    return Promise.resolve(result)
      .then((r) =>
        ops.single && r.data == null && !r.error
          ? { data: null, error: Object.assign(new Error('0 rows'), { code: 'PGRST116' }) }
          : r
      )
      .then(resolve, reject);
  };
  return builder;
}

export const fakeSupabase = {
  from: (table: string) => makeBuilder(table),
  rpc: (name: string, args?: unknown) => {
    fakeRpcCalls.push({ name, args });
    const handler = rpcHandlers.get(name);
    if (!handler) {
      return Promise.resolve({
        data: null,
        error: Object.assign(new Error(`Could not find the function public.${name}`), {
          code: 'PGRST202',
        }),
      });
    }
    return Promise.resolve(handler(args));
  },
  auth: {
    getSession: () => Promise.resolve({ data: { session } }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => undefined } },
    }),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
  },
};
