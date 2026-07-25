export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ValidationError extends Error {}
export class AuthenticationError extends Error {}
export class AdminTokenError extends AuthenticationError {}
export class TotpRequiredError extends AuthenticationError {}
