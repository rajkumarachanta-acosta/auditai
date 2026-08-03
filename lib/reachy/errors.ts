export class ReachyError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ReachyError";
    this.code = code;
    this.status = status;
  }
}

export class UnauthorizedError extends ReachyError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends ReachyError {
  constructor(message = "You do not have permission to perform this action") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends ReachyError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
  }
}

export class ValidationError extends ReachyError {
  details?: unknown;

  constructor(message = "Invalid request", details?: unknown) {
    super("VALIDATION_ERROR", message, 422);
    this.details = details;
  }
}

export function toApiError(error: unknown): { status: number; body: { error: { code: string; message: string; details?: unknown } } } {
  if (error instanceof ReachyError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, details: (error as ValidationError).details } },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
  };
}
