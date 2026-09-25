class JsonNumber {
  constructor(readonly token: string) {}
}

export type JsonValue = null | string | boolean | JsonNumber | JsonValue[] | Map<string, JsonValue>;

export class IdentityJsonError extends Error {
  constructor() { super('INVALID_IDENTITY_JSON'); }
}

/** Parse the signed user/chat objects without converting JSON numbers to IEEE-754. */
export function parseIdentityObject(source: string): Map<string, JsonValue> {
  let position = 0;
  const fail = (): never => { throw new IdentityJsonError(); };
  const whitespace = (): void => {
    while (position < source.length && /[\u0020\t\r\n]/.test(source[position]!)) position++;
  };
  const string = (): string => {
    const start = position;
    if (source[position++] !== '"') return fail();
    let escaped = false;
    while (position < source.length) {
      const character = source[position++]!;
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === '"') {
        try { return JSON.parse(source.slice(start, position)) as string; }
        catch { return fail(); }
      }
    }
    return fail();
  };
  const value = (depth: number): JsonValue => {
    if (depth > 32) return fail();
    whitespace();
    const character = source[position];
    if (character === '"') return string();
    if (character === '{') {
      position++;
      const object = new Map<string, JsonValue>();
      whitespace();
      if (source[position] === '}') { position++; return object; }
      while (position < source.length) {
        whitespace();
        const key = string();
        if (object.has(key)) return fail();
        whitespace();
        if (source[position++] !== ':') return fail();
        object.set(key, value(depth + 1));
        whitespace();
        const separator = source[position++];
        if (separator === '}') return object;
        if (separator !== ',') return fail();
      }
      return fail();
    }
    if (character === '[') {
      position++;
      const array: JsonValue[] = [];
      whitespace();
      if (source[position] === ']') { position++; return array; }
      while (position < source.length) {
        array.push(value(depth + 1));
        whitespace();
        const separator = source[position++];
        if (separator === ']') return array;
        if (separator !== ',') return fail();
      }
      return fail();
    }
    for (const [literal, parsed] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, position)) {
        position += literal.length;
        return parsed;
      }
    }
    const token = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(position))?.[0];
    if (!token) return fail();
    position += token.length;
    return new JsonNumber(token);
  };
  const parsed = value(0);
  whitespace();
  if (position !== source.length || !(parsed instanceof Map)) return fail();
  return parsed;
}

export function canonicalInteger(value: JsonValue | undefined): string {
  if (!(value instanceof JsonNumber) || !/^(?:0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(value.token)) {
    throw new IdentityJsonError();
  }
  return BigInt(value.token).toString(10);
}
