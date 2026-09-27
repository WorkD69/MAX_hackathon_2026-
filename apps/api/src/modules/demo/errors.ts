export class DemoError extends Error {
  constructor(readonly code: 'DEMO_MODE_DISABLED' | 'DEMO_PRIMARY_CASE_EXISTS' | 'RESOURCE_NOT_FOUND' |
    'AUTH_BOOTSTRAP_FAILED' | 'VALIDATION_FAILED' | 'INTERNAL_ERROR', readonly status: number) { super(code); }
}
