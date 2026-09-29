# Other stacks — applying the same principles outside .NET/Angular

This plugin has exactly one deeply validated reference implementation: a .NET backend
(`dotnet-backend.md`, `auth-server.md`, `messaging-workers.md`) and an Angular frontend
(`angular-frontend.md`), both with templates that were actually compiled/type-checked and
smoke-tested. Everything in this file is **general guidance, not a tested template** — confirm exact
package names, current versions, and configuration flags against that language's own current
OpenTelemetry documentation before installing anything, per the "don't invent an API, package, or
option" rule. Where this file names a specific package, treat the name as a starting point to verify,
not a pinned fact the way the .NET/Angular versions in `CHANGELOG.md` are.

The requirements themselves don't change by language — everything in `00-principles.md` still applies:
a stable `service.name` across environments, `deployment.environment` carrying the environment, a
Trace ID on every error response, propagation restricted to this project's own services, secrets never
committed, `enduser.id` opaque, and 100% sampling by default.

## 1. Backend: auto-instrumentation first, then a small custom piece for the Trace ID

Every major backend language now has an OpenTelemetry **auto-instrumentation** option that wires up
tracing, metrics, and common library instrumentation (the HTTP framework, the SQL driver, the HTTP
client) with little to no code change. Auto-instrumentation alone is **not enough** for this plugin's
actual value proposition, though: it doesn't put a Trace ID into your error response body or add an
`X-Trace-Id` header — that always needs a small piece of custom code, shaped like
`templates/dotnet/TraceIdResponseExtensions.cs`, adapted to the framework's own error-handling
mechanism.

| Language/framework | Auto-instrumentation entry point | Where to add the Trace ID to an error response |
|---|---|---|
| Java (Spring Boot and most others) | The OpenTelemetry Java agent, attached with `-javaagent:opentelemetry-javaagent.jar`, configured through `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, and `OTEL_RESOURCE_ATTRIBUTES` (or a properties file) | A `@RestControllerAdvice`/`@ExceptionHandler` global handler, reading `Span.current().getSpanContext().getTraceId()` |
| Node.js (Express, NestJS, Fastify, ...) | `@opentelemetry/auto-instrumentations-node`, loaded via `--require` or `NODE_OPTIONS` before the app starts | The framework's error-handling middleware, reading `trace.getSpan(context.active())?.spanContext().traceId` |
| Python (Django, Flask, FastAPI) | The `opentelemetry-instrument` CLI wrapper, with `opentelemetry-distro` + the exporter package installed | The framework's exception handler, reading `trace.get_current_span().get_span_context().trace_id` (format it as 32 lowercase hex) |
| Go | No single auto-instrumentation agent; use the framework-specific middleware instead (`otelhttp`, `otelgin`, ...) | The error-handling middleware, reading `trace.SpanFromContext(ctx).SpanContext().TraceID()` |
| Ruby (Rails) | The `opentelemetry-instrumentation-all` gem plus the SDK/exporter gems | A Rails `rescue_from` handler, reading the current span's trace ID from the OpenTelemetry Ruby SDK |

For every one of these, still apply `references/00-principles.md` in full: the resource attributes
(§1), the two-channel error contract — a header plus a body field (§2), restricted propagation (§3),
and the same secret-handling posture (§4) using whatever secret mechanism that language's ecosystem
normally uses (an env var, a vault client library, a config server).

## 2. Frontend: the browser-level SDK already generalizes

`templates/angular/telemetry.service.ts` is mostly framework-agnostic already: `WebTracerProvider`,
`FetchInstrumentation`, `XMLHttpRequestInstrumentation`, `DocumentLoadInstrumentation`, and
`UserInteractionInstrumentation` all instrument the **browser's own APIs** (`fetch`, `XMLHttpRequest`,
`document`, DOM events), not anything specific to Angular. The same `@opentelemetry/sdk-trace-web` +
instrumentation packages work unchanged in React, Vue, Svelte, or a plain script tag.

What's actually framework-specific, and needs re-wiring per framework:

| Piece | Angular (this plugin's template) | React | Vue |
|---|---|---|---|
| Where initialization runs once | `provideAppInitializer` | Once, at the app's root — a top-level effect/call before `ReactDOM.createRoot(...).render(...)`, not inside a component that can re-render | A Vue plugin (`app.use(...)`) or a one-time call in `main.ts` before `createApp(...).mount(...)` |
| The error-interceptor pattern | A functional `HttpInterceptorFn` | An Axios interceptor (`axios.interceptors.response.use`) or a `fetch` wrapper | Same as React — Axios interceptor or a `fetch` wrapper, since Vue has no built-in HTTP client |
| The notification UI | `ErrorNotificationService`, adaptable to several libraries (`angular-frontend.md` §7) | Whatever dialog/toast library the project uses (e.g. a headless UI dialog + `react-hot-toast`) | Whatever dialog/toast library the project uses (e.g. a modal component + `vue-toastification`) |
| SSR guard | `isPlatformBrowser(inject(PLATFORM_ID))` | A `typeof window !== 'undefined'` check before initializing, in a Next.js/Remix SSR context | The same `typeof window !== 'undefined'` check, in a Nuxt SSR context |

The rest of `templates/angular/telemetry.service.ts` — the resource attributes, the
`propagateTraceHeaderCorsUrls` construction, the `ignoreUrls` self-exclusion, the placeholder checks —
ports over close to verbatim.

`templates/angular/trace-id.util.ts` (the show/don't-show decision and the Trace ID extraction logic)
has **no Angular dependency at all** beyond its `HttpErrorResponse` type import — port the logic as
plain functions against whatever error shape the project's own HTTP client produces (an Axios error, a
native `fetch` rejection), and keep the same status-code table from `error-contract.md` §2.

## 3. When `discovery` or `setup` hits an unfamiliar stack

- `discovery` reports it using the general checklist (`agents/discovery.md` §4) and states plainly
  that there's no dedicated reference for it.
- `setup` follows the same phases as for .NET/Angular, but implements the observability and
  error-contract code directly against `00-principles.md` and this file, instead of copying a
  template — and says so explicitly in the plan presented during Phase 4, so the user knows that part
  of the implementation carries more risk and deserves closer review than the .NET/Angular path.
- `review`'s checklist stays the same regardless of stack — every item in it is a principle, not a
  .NET-specific fact (see the note on `IHttpClientFactory` and `SetDbQueryParameters` in
  `skills/review/SKILL.md`, which names their equivalent in other ecosystems).
