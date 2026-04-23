// HTTP error translation for API routes.
//
// Services throw typed HttpError subclasses for expected domain failures.
// Routes wrap every handler in a try/catch and funnel the caught value through
// `toErrorResponse`, which decides the HTTP status code and produces the JSON
// body.
//
// Classification strategy (Phase 3):
//   1. ZodError              -> 400 with the issue list
//   2. HttpError subclass    -> the status baked into the class
//   3. plain Error            -> deprecated substring fallback for legacy throws
//   4. anything else          -> 500
//
// Keep the substring matcher for the first typed-error release, but new service
// throws should use the classes below directly.

import { json } from '@sveltejs/kit';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message: string) {
    super(503, message);
    this.name = 'ServiceUnavailableError';
  }
}

export interface ErrorBody {
  error: string;
  message?: string;
  issues?: z.ZodIssue[];
}

/** Translate a thrown value into a JSON Response. Never throws. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof z.ZodError) {
    return json(
      { error: 'ValidationError', issues: err.issues },
      { status: 400 },
    );
  }

  if (err instanceof HttpError) {
    return json(
      { error: err.name, message: err.message },
      { status: err.status },
    );
  }

  if (err instanceof Error) {
    const status = classifyServiceError(err.message);
    return json(
      { error: classNameForStatus(status), message: err.message },
      { status },
    );
  }

  return json(
    { error: 'InternalError', message: 'Unknown error' },
    { status: 500 },
  );
}

/**
 * Map a raw legacy service error message onto an HTTP status code.
 *
 * Deprecated Phase 6 fallback only. New service errors should throw an
 * HttpError subclass directly instead of relying on this classifier.
 */
function classifyServiceError(message: string): number {
  const m = message.toLowerCase();

  if (/\bnot found\b/.test(m)) {
    return 404;
  }

  if (
    /\b(cannot|must|already|invalid|only|owned by|terminal|occupied|mismatch|requires|required|does not match|is not|not ready|has moved|out of)\b/.test(
      m,
    )
  ) {
    return 409;
  }

  return 500;
}

function classNameForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'ValidationError';
    case 401:
      return 'UnauthorizedError';
    case 404:
      return 'NotFoundError';
    case 409:
      return 'ConflictError';
    case 503:
      return 'ServiceUnavailableError';
    default:
      return 'InternalError';
  }
}
