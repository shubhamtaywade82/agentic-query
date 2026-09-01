export class QueryValidationError extends Error {
  readonly code: string = 'QUERY_VALIDATION_ERROR';
  constructor(message: string) { super(message); this.name = 'QueryValidationError'; }
}
