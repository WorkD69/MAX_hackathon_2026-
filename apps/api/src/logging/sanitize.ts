const sensitiveKeys = new Set([
  'authorization', 'cookie', 'xmaxbotapisecret', 'initdata', 'sessiontoken',
  'token', 'maxbottoken', 'maxwebhooksecret', 'appsessionsecret',
  'databaseurl', 'password', 'filebytes', 'bytes',
]);

export function canonicalizeLogKey(key: string): string {
  return key.toLowerCase().replace(/[_\-.]/g, '');
}

export function sanitizeForLog(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const visit = (item: unknown, depth: number): unknown => {
    if (typeof item === 'symbol' || typeof item === 'function' || typeof item === 'undefined') return undefined;
    if (item === null || typeof item !== 'object') return item;
    if (depth >= 8) return '[TRUNCATED]';
    if (seen.has(item)) return '[CIRCULAR]';
    seen.add(item);
    try {
      if (Array.isArray(item)) {
        const copy = item.slice(0, 100).map(child => visit(child, depth + 1));
        if (item.length > 100) copy.push('[TRUNCATED]');
        return copy;
      }
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) return '[TRUNCATED]';
      const copy: Record<string, unknown> = {};
      const keys = Object.keys(item);
      for (const key of keys.slice(0, 100)) {
        const next = sensitiveKeys.has(canonicalizeLogKey(key)) ? '[REDACTED]' :
          visit((item as Record<string, unknown>)[key], depth + 1);
        if (next !== undefined) copy[key] = next;
      }
      if (keys.length > 100) copy['[TRUNCATED]'] = '[TRUNCATED]';
      return copy;
    } finally { seen.delete(item); }
  };
  return visit(value, 0);
}
