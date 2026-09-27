import { z } from 'zod';
import {
  CategoriesReadResponseSchema, CategoryCreateRequestSchema, CategoryPatchRequestSchema,
  ContractorBindingPutRequestSchema, ContractorCreateRequestSchema,
  ContractorEmployeePutRequestSchema, ContractorsReadResponseSchema, ErrorResponseSchema,
  HouseCreateRequestSchema, HousePatchRequestSchema, HousesReadResponseSchema,
  OrganizationPatchRequestSchema, OrganizationReadResponseSchema,
  UserRoleBindingPutRequestSchema, UsersReadResponseSchema, UuidSchema,
} from '@max-smart-city/contracts';
import { MutationIntent } from '../../app/intent/mutation-intent.js';
import { safeMutationErrorText } from '../../app/intent/safe-error.js';

export type AuthorizedFetch = (path: string, init?: RequestInit) => Promise<Response>;
export type Organization = z.output<typeof OrganizationReadResponseSchema>;
export type House = z.output<typeof HousesReadResponseSchema>[number];
export type Category = z.output<typeof CategoriesReadResponseSchema>[number];
export type Contractor = z.output<typeof ContractorsReadResponseSchema>[number];
export type User = z.output<typeof UsersReadResponseSchema>[number];

export class ConfigurationHttpError extends Error {
  constructor(readonly status: number, readonly code: string | null, readonly requestId: string | null = null) {
    super(safeMutationErrorText(code, requestId));
  }
}

const base = '/api/v1/config';
const identifier = (value: string) => UuidSchema.parse(value);

export function configurationApi(fetcher: AuthorizedFetch, contextKey = '') {
  const intents = new Map<string, MutationIntent>();
  async function send<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await fetcher(path, { cache: 'no-store' });
    if (!response.ok) throw await httpError(response);
    return schema.parse(await response.json());
  }
  async function write(path: string, method: 'POST' | 'PATCH' | 'PUT', schema: z.ZodType, value: unknown): Promise<void> {
    const body = schema.parse(value);
    const slot = `${method}:${path}`;
    let intent = intents.get(slot);
    if (!intent) { intent = new MutationIntent(); intents.set(slot, intent); }
    const resolved = await intent.resolve({ operation: `Configuration ${slot}`, method, path,
      context: contextKey, targets: path, payload: body });
    const response = await fetcher(path, {
      method, cache: 'no-store',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Idempotency-Key': resolved.key },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await httpError(response);
      if (error.status === 409) intent.close();
      throw error;
    }
    intent.close();
  }
  return {
    organization: () => send(`${base}/organization`, OrganizationReadResponseSchema),
    houses: () => send(`${base}/houses`, HousesReadResponseSchema),
    categories: () => send(`${base}/categories`, CategoriesReadResponseSchema),
    contractors: () => send(`${base}/contractors`, ContractorsReadResponseSchema),
    users: () => send(`${base}/users`, UsersReadResponseSchema),
    organizationUpdate: (value: z.input<typeof OrganizationPatchRequestSchema>) => write(`${base}/organization`, 'PATCH', OrganizationPatchRequestSchema, value),
    houseCreate: (value: z.input<typeof HouseCreateRequestSchema>) => write(`${base}/houses`, 'POST', HouseCreateRequestSchema, value),
    houseUpdate: (id: string, value: z.input<typeof HousePatchRequestSchema>) => write(`${base}/houses/${identifier(id)}`, 'PATCH', HousePatchRequestSchema, value),
    categoryCreate: (value: z.input<typeof CategoryCreateRequestSchema>) => write(`${base}/categories`, 'POST', CategoryCreateRequestSchema, value),
    categoryUpdate: (id: string, value: z.input<typeof CategoryPatchRequestSchema>) => write(`${base}/categories/${identifier(id)}`, 'PATCH', CategoryPatchRequestSchema, value),
    contractorCreate: (value: z.input<typeof ContractorCreateRequestSchema>) => write(`${base}/contractors`, 'POST', ContractorCreateRequestSchema, value),
    contractorBinding: (id: string, active: boolean) => write(`${base}/contractors/${identifier(id)}/binding`, 'PUT', ContractorBindingPutRequestSchema, { active }),
    userRoleBinding: (id: string, value: z.input<typeof UserRoleBindingPutRequestSchema>) => write(`${base}/users/${identifier(id)}/role-binding`, 'PUT', UserRoleBindingPutRequestSchema, value),
    contractorEmployee: (contractorId: string, appUserId: string, active: boolean) => write(`${base}/contractors/${identifier(contractorId)}/employees/${identifier(appUserId)}`, 'PUT', ContractorEmployeePutRequestSchema, { active }),
  };
}

async function httpError(response: Response): Promise<ConfigurationHttpError> {
  let code: string | null = null;
  let requestId: string | null = null;
  try {
    const parsed = ErrorResponseSchema.safeParse(await response.json());
    if (parsed.success) { code = parsed.data.error.code; requestId = parsed.data.error.request_id; }
  } catch { /* A transport error may have no canonical JSON body. */ }
  return new ConfigurationHttpError(response.status, code, requestId);
}
