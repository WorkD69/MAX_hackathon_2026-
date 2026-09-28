/** PostgreSQL jsonb reorders keys; serialize owner and replay responses identically. */
export function canonicalJson(value: unknown): string {
  const ordered = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, ordered(nested)]));
    }
    return item;
  };
  const serialized = JSON.stringify(ordered(value));
  if (serialized === undefined) throw new Error('INVALID_CANONICAL_RESPONSE');
  return serialized;
}
