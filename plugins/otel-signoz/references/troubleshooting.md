# Troubleshooting

## Nothing shows up in SigNoz after configuring it

Check, in this order:
1. **Ingestion key and endpoint** — a typo, an expired key, or an endpoint copied without its port
   (`:443`).
2. **URL suffix** — the exporter needs the endpoint **without** `/v1/traces` etc.; the template's own
   `ConfigureOtlp` appends `/v1/{signal}` — if you hand-rolled the exporter config instead of using the
   template, double-check you didn't append the suffix twice or not at all.
3. **Network/firewall** — outbound HTTPS to the ingestion host blocked from where the app actually
   runs (a locked-down App Service, a corporate proxy, an on-prem network).
4. **The exporter's own error log** — on .NET, look for the `OpenTelemetry` logger category; other
   SDKs log the same kind of exporter failure under their own category/namespace. This is usually the
   fastest way to the real cause, faster than guessing from the symptom alone.

## The frontend's trace doesn't connect with the backend's

- `propagateTraceHeaderCorsUrls`/`propagateTo` doesn't match the API's real URL — check the regex
  against the actual base URL, including protocol and port.
- The backend's CORS doesn't allow the `traceparent`/`tracestate` headers — add them to the allowed
  headers list if the project uses an explicit one (`error-contract.md` §1 and
  `angular-frontend.md` §4 cover both sides of this).

## Login broke right after installing this

Almost always: the frontend is propagating `traceparent` to a third-party domain (Microsoft/MSAL login,
another IdP) that then refuses the CORS preflight the extra header triggers. Remove that domain from
`propagateTo` — third-party domains must never be in that list in the first place
(`references/00-principles.md` §3).

## `X-Trace-Id` is invisible in the frontend

The header is present on the wire but the browser's `fetch`/`XHR` API hides it from JavaScript unless
the backend's CORS explicitly exposes it. Add `WithExposedHeaders("X-Trace-Id")` (or that stack's
equivalent) to the CORS policy.

## A toast shows up twice for the same error

A call has its own local error handling (a `catchError`/`subscribe({ error })` that shows a message)
**and** the global interceptor also fires. Mark that call with `SKIP_GLOBAL_ERROR_UI`
(`angular-frontend.md` §8) so only the local handling renders a notification, using
`ErrorNotificationService.fromHttpError(err)` from inside it to keep the Trace ID.

## Serilog (or another structured logger) is swallowing the OpenTelemetry provider

When a project's logging is fully replaced by `UseSerilog()`/`AddSerilog(dispose: true)`, logs may stop
flowing through the OpenTelemetry log provider entirely. Either set `writeToProviders: true` on
`UseSerilog`, or add the `Serilog.Sinks.OpenTelemetry` sink; either way, make sure the log entries carry
the current trace/span ID so they can still be found from a Trace ID.

## Cost is higher than expected

Apply the levers in `references/00-principles.md` §6, in order: filter health checks/Swagger/static
assets out of traces first, then lower the exported log level (never `Debug` in production), then turn
off click-instrumentation on the frontend if nobody uses it, and only then consider sampling — with the
explicit trade-off that sampling below 100% breaks the "every Trace ID shown to a user exists in
SigNoz" guarantee (§6 again).

## `OpenTelemetry.Instrumentation.SqlClient` doesn't resolve

As of this plugin's own build (September 2026), this package resolves as a **stable** release — no
`--prerelease` flag needed (`references/dotnet-backend.md` §2). If it fails to resolve for you, check
the current state on NuGet before falling back to `--prerelease`; the package's stability status can
change over time, and `--prerelease` pulls in a pre-release version you may not want by default.

## A "Zone already loaded" warning (or a similar zone.js conflict) in the browser console

The app installed the plain `@opentelemetry/context-zone` package instead of the
`context-zone-peer-dep` build, so it now ships a second zone.js alongside the app's own
(`angular-frontend.md` §2). Swap the import for `@opentelemetry/context-zone-peer-dep`. In a zoneless
app, drop the zone-based context manager entirely and use `StackContextManager` instead.
