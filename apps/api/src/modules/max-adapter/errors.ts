export type MaxFailureDisposition = 'transient' | 'permanent';

export class MaxAdapterError extends Error {
  constructor(
    readonly disposition: MaxFailureDisposition,
    readonly safeCode: string,
  ) {
    super(safeCode);
    this.name = 'MaxAdapterError';
  }
}

export function classifyHttpFailure(status: number): MaxAdapterError {
  if (status === 408) return new MaxAdapterError('transient', 'MAX_HTTP_408');
  if (status === 429) return new MaxAdapterError('transient', 'MAX_HTTP_429');
  if (status >= 500 && status <= 599) return new MaxAdapterError('transient', 'MAX_HTTP_5XX');
  if (status === 401) return new MaxAdapterError('permanent', 'MAX_AUTH_REJECTED');
  if (status >= 300 && status <= 399) return new MaxAdapterError('permanent', 'MAX_REDIRECT_REJECTED');
  if (status >= 400 && status <= 499) return new MaxAdapterError('permanent', 'MAX_REQUEST_REJECTED');
  return new MaxAdapterError('transient', 'MAX_UNEXPECTED_RESPONSE');
}
