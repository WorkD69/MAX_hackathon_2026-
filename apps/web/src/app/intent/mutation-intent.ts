/** An intent lives only in memory. A reload must fetch authoritative state before another action. */
export interface MutationSnapshot {
  readonly operation: string;
  readonly method: string;
  readonly path: string;
  readonly context: string;
  readonly targets?: unknown;
  readonly payload?: unknown;
  readonly files?: readonly File[];
}

export interface ResolvedIntent {
  readonly key: string;
  readonly fingerprint: string;
}

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

async function fileIdentity(file: File): Promise<unknown> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return { name: file.name, type: file.type, size: file.size,
    digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') };
}

export async function fingerprintIntent(snapshot: MutationSnapshot): Promise<string> {
  const files = await Promise.all((snapshot.files ?? []).map(fileIdentity));
  return canonical({ operation: snapshot.operation, method: snapshot.method, path: snapshot.path,
    context: snapshot.context, targets: snapshot.targets, payload: snapshot.payload, files });
}

export class MutationIntent {
  private active: ResolvedIntent | null = null;
  private queue: Promise<void> = Promise.resolve();

  async resolve(snapshot: MutationSnapshot): Promise<ResolvedIntent> {
    const fingerprint = await fingerprintIntent(snapshot);
    const previous = this.queue;
    let release = () => {};
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      if (this.active?.fingerprint === fingerprint) return this.active;
      this.active = { fingerprint, key: crypto.randomUUID() };
      return this.active;
    } finally { release(); }
  }

  /** Only confirmed success or an authoritative stale/context rejection closes an intent. */
  close(): void { this.active = null; }

  get current(): ResolvedIntent | null { return this.active; }
}

export function mutationError(error: unknown): { status: number | null; code: string | null } {
  if (typeof error !== 'object' || error === null) return { status: null, code: null };
  const value = error as { status?: unknown; code?: unknown };
  return { status: typeof value.status === 'number' ? value.status : null,
    code: typeof value.code === 'string' ? value.code : null };
}
