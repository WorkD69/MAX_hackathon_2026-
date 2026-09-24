import type { ParsedRuntimeConfig } from './schema.js';

type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

export type RuntimeConfig = DeepReadonly<ParsedRuntimeConfig>;
