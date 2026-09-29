// otel-signoz plugin template — rule for when to show the Trace ID (decided in the frontend only).
import { HttpErrorResponse } from '@angular/common/http';

export const TRACE_ID_HEADER = 'X-Trace-Id';

/** Expected domain responses: do NOT show the Trace ID/support block. Everything else is a system failure. */
export const EXPECTED_DOMAIN_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422, 429]);

const W3C_TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i;
const HEX_TRACE_ID = /^[\da-f]{32}$/i;
const FRAMEWORK_DEFAULT_MESSAGE = /^An error occurred/i; // ASP.NET Core's default 500 ProblemDetails title

export interface ErrorDetails {
  status: number;
  message: string;
  /** System failure: show the code + copy button + support guidance. */
  isSystemFailure: boolean;
  /** Only set on a system failure, and only when the backend actually returned one. */
  traceId?: string;
  /** ISO 8601 — lets you search SigNoz even with no Trace ID (status 0). */
  occurredAt: string;
  /** API route without the query string (avoids leaking PII into the copied text). */
  apiPath?: string;
}

export function isSystemFailure(status: number): boolean {
  // 0 (network/timeout) and >= 500 are already outside the expected set; kept explicit for readability.
  return status === 0 || status >= 500 || !EXPECTED_DOMAIN_STATUSES.has(status);
}

/** Reads the Trace ID from the body (traceId/traceID/trace_id) or the X-Trace-Id header; normalizes the full W3C format. */
export function extractTraceId(error: HttpErrorResponse): string | undefined {
  const body = error.error as Record<string, unknown> | null | undefined;
  const fromBody = body && typeof body === 'object' ? (body['traceId'] ?? body['traceID'] ?? body['trace_id']) : undefined;
  const raw = (typeof fromBody === 'string' && fromBody) || error.headers?.get(TRACE_ID_HEADER) || undefined;
  if (!raw) return undefined;

  const w3c = W3C_TRACEPARENT.exec(raw);
  if (w3c) return w3c[1].toLowerCase();
  return HEX_TRACE_ID.test(raw) ? raw.toLowerCase() : raw;
}

function pickMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return typeof body === 'string' && body.length < 300 ? body : undefined;
  const b = body as Record<string, unknown>;
  // Adjust the field order to the project's own envelope (e.g. a "mensagem" field ahead of the rest).
  const candidate = b['message'] ?? b['mensagem'] ?? b['detail'] ?? b['title'];
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

function apiPathOf(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, globalThis.location?.origin ?? 'http://localhost').pathname;
  } catch {
    return undefined;
  }
}

export function toErrorDetails(
  error: HttpErrorResponse,
  fallbackMessage = 'Could not complete the operation.',
): ErrorDetails {
  const system = isSystemFailure(error.status);
  const serverMessage = pickMessage(error.error);

  let message: string;
  if (error.status === 0) {
    message = 'Could not reach the server. Check your connection and try again.';
  } else if (system) {
    // 5xx: use the backend's message (already masked by the project's own policy), except the framework's default text.
    message = serverMessage && !FRAMEWORK_DEFAULT_MESSAGE.test(serverMessage)
      ? serverMessage
      : 'An unexpected error occurred while processing your request.';
  } else {
    message = serverMessage ?? fallbackMessage;
  }

  return {
    status: error.status,
    message,
    isSystemFailure: system,
    traceId: system ? extractTraceId(error) : undefined,
    occurredAt: new Date().toISOString(),
    apiPath: apiPathOf(error.url),
  };
}
