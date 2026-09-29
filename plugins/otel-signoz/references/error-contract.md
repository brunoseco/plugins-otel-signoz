# Error contract — the Trace ID, from the backend to the screen

This file documents the contract using the plugin's .NET + Angular reference implementation. The
contract itself — a header and/or body field on every error response, shown to the user only on a
system failure — is language-agnostic; see `references/other-stacks.md` for the same shape in another
backend/frontend stack.

## 1. Backend: three layers, in order of coverage

| Layer | What it covers | How |
|---|---|---|
| **`X-Trace-Id` header** on every response | Everything, including custom controller returns, downloads (blob streams), and responses that never reach the handler | `app.UseTraceIdHeader()` + `WithExposedHeaders("X-Trace-Id")` in CORS |
| **`traceId` in ProblemDetails** | `[ApiController]`'s automatic 400, `Problem(...)`, a ProblemDetails-based handler | `services.AddTraceIdToProblemDetails()` (.NET 7+) — composes with any existing customization |
| **`traceId` in a custom handler/envelope** | An exception-handling middleware/filter and envelopes like `ApiResponse { success, message }` | `context.MarkErrorAndGetTraceId(ex)` in the catch block + a `traceId` field in the envelope |

.NET 8 minimal APIs: `Results.Problem` does **not** get a `traceId` in the body (verified) — the header
covers it. The header alone already makes the feature work; the body field just makes it easier for
other consumers and logs to pick up.

### An existing handler/middleware — add to it, don't rewrite it

```csharp
catch (Exception ex)
{
    var traceId = context.MarkErrorAndGetTraceId(ex);     // marks the span as an error + records the exception
    _logger.LogError(ex, "Unhandled error at {Path}", context.Request.Path);   // a correlated log
    // ... the exception → status mapping the project ALREADY has, untouched ...
    await context.Response.WriteAsJsonAsync(new { message, traceId });  // or the project's own envelope/ProblemDetails
}
```

- `IExceptionHandler` (.NET 8+): the same pattern inside `TryHandleAsync`.
- An MVC filter (`IExceptionFilter`): `context.HttpContext.MarkErrorAndGetTraceId(context.Exception)`.
- Business exceptions already mapped to a status (400/422/404) also carry `traceId` in the body — the
  frontend decides whether to show it.

### A custom envelope

Add `traceId` to the error envelope's **base class** (one place), populated by the
factory/handler. If the envelope is built in many controllers, add a single helper
(`ApiError.From(context, message)`) and swap it in at the **custom points prioritized during the
interview** — not everywhere at once without agreement.

### An error returned with HTTP 200 (`success: false`)

The frontend's HTTP interceptor doesn't see this as an error. Don't change the status without a
decision (it breaks the contract with existing consumers). Options, to decide with the user:
1. Include `traceId` in the envelope and handle `success === false` in the same frontend notification
   service.
2. Plan a migration to correct statuses in a future release (record it as technical debt).

## 2. Frontend: when to show it

| Show the Trace ID + copy + support (a system failure) | Don't show it (an expected domain response) |
|---|---|
| `>= 500` | `400`/`422` — validation/business rule |
| `0` — network/timeout/server unreachable (no Trace ID here: show the date/time and route instead, for searching) | `401` — expired session (the login flow) |
| Any status outside the list to the right (e.g. `405`, `409`, `415`) | `403`, `404`, `429` |

Implementation: `templates/angular/trace-id.util.ts` (`toErrorDetails`) + `error.interceptor.ts` +
`error-notification.service.ts`. The rule lives **only in the frontend**; the backend always sends the
data.

## 3. Minimum content of the system-failure message

1. The message (unchanged from the project's own masking policy).
2. The **error code (Trace ID)**, selectable.
3. A **Copy details** button → copies: system, message, Trace ID, ISO date/time, screen, API route
   (no query string), environment, and version. Falls back to `document.execCommand('copy')` when
   `navigator.clipboard` doesn't exist (plain-HTTP intranet).
4. Guidance: "If this keeps happening, contact support or your system administrator with this code."
   + a `mailto:` link with a pre-filled subject/body and/or a ticket URL.
5. HTML always escaped — the message comes from the server (an XSS risk otherwise).

## 4. Custom points in the frontend

Calls that handle their own error locally (a local toast in `subscribe({ error })`/`catchError`):
- If the local handling **only shows a message**: remove it and let the global interceptor handle it.
- If it needs its own logic (e.g. flagging a form field): keep that logic, mark the call with
  `SKIP_GLOBAL_ERROR_UI`, and use `ErrorNotificationService.fromHttpError(err)` to display it — so the
  Trace ID still shows up without a duplicate toast.

## 5. Screens outside Angular

Non-Angular error pages (Auth, legacy pages): show the same block (code + copy + support) using
`HttpContext.GetTraceId()` or that stack's equivalent.
