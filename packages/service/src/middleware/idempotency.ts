const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

type EntryStatus = 'pending' | 'completed';

interface CachedResponse {
  status: EntryStatus;
  httpStatus?: number;
  body?: any;
  resolvers: Array<(value: { httpStatus: number; body: any }) => void>;
  timestamp: number;
}

const store = new Map<string, CachedResponse>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
        store.delete(key);
      }
    }
  }, 60 * 1000);
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }
}

startCleanup();

export function clearIdempotencyStore(): void {
  store.clear();
}

export function getIdempotencyStoreSize(): number {
  return store.size;
}

export const IdempotencyResult = {
  DUPLICATE: 'duplicate',
  PENDING: 'pending',
  NEW: 'new',
} as const;

export type IdempotencyResultType = (typeof IdempotencyResult)[keyof typeof IdempotencyResult];

export interface IdempotencyCheckResult {
  type: IdempotencyResultType;
  response?: { status: number; body: any };
  pendingPromise?: Promise<{ httpStatus: number; body: any }>;
}

export function checkOrMarkIdempotency(key: string | undefined | null): IdempotencyCheckResult {
  if (!key) {
    return { type: IdempotencyResult.NEW };
  }

  const existing = store.get(key);

  if (existing) {
    if (existing.status === 'completed') {
      console.error(`[Idempotency] Hit (completed): ${key} (age: ${Date.now() - existing.timestamp}ms)`);
      return { type: IdempotencyResult.DUPLICATE, response: { status: existing.httpStatus!, body: existing.body } };
    }

    if (existing.status === 'pending') {
      console.error(`[Idempotency] Hit (pending): ${key} — concurrent request, waiting for result`);
      const promise = new Promise<{ httpStatus: number; body: any }>((resolve) => {
        existing.resolvers.push(resolve);
      });
      return { type: IdempotencyResult.PENDING, pendingPromise: promise };
    }
  }

  console.error(`[Idempotency] Miss: ${key} — marking as pending`);
  store.set(key, { status: 'pending', timestamp: Date.now(), resolvers: [] });
  return { type: IdempotencyResult.NEW };
}

export function storeIdempotencyResult(key: string | undefined | null, httpStatus: number, body: any): void {
  if (!key) return;

  const existing = store.get(key);
  if (existing) {
    existing.status = 'completed';
    existing.httpStatus = httpStatus;
    existing.body = body;
    existing.timestamp = Date.now();

    for (const resolve of existing.resolvers) {
      resolve({ httpStatus, body });
    }
    existing.resolvers = [];

    console.error(`[Idempotency] Stored: ${key}`);
  } else {
    store.set(key, { status: 'completed', httpStatus, body, timestamp: Date.now(), resolvers: [] });
    console.error(`[Idempotency] Stored (no pending): ${key}`);
  }
}

export function storeIdempotencyError(key: string | undefined | null, httpStatus: number, errorBody: any): void {
  if (!key) return;

  const existing = store.get(key);
  if (existing) {
    existing.status = 'completed';
    existing.httpStatus = httpStatus;
    existing.body = errorBody;
    existing.timestamp = Date.now();

    for (const resolve of existing.resolvers) {
      resolve({ httpStatus, body: errorBody });
    }
    existing.resolvers = [];
  } else {
    store.set(key, { status: 'completed', httpStatus, body: errorBody, timestamp: Date.now(), resolvers: [] });
  }
}