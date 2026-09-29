# Angular frontend

This is the plugin's deeply validated reference implementation for a frontend. If the target project
uses another framework (React, Vue, ...), apply `references/other-stacks.md` instead — much of what
follows (the OpenTelemetry Web SDK itself, instrumenting `fetch`/`XHR` at the browser API level) is
already framework-agnostic; only the wiring and the error-interceptor pattern are Angular-specific.

## 1. Compatibility by Angular version

| Angular | What changes |
|---|---|
| **< 14** | No standalone components. Register `TelemetryService` and its initializer in an `NgModule` (`AppModule`), using the classic `APP_INITIALIZER` token in the module's `providers`. |
| **14–18** | Standalone components are available. `APP_INITIALIZER` as an object (`{provide: APP_INITIALIZER, useFactory, deps, multi: true}`) in `app.config.ts`. |
| **19+** | Prefer `provideAppInitializer(fn)` (the functional API) over the `APP_INITIALIZER` token — simpler, no manual `useFactory`/`deps`/`multi`: `provideAppInitializer(() => inject(TelemetryService).initialize())`. |
| **Interceptors** | Angular 15+ supports functional interceptors (`HttpInterceptorFn` + `withInterceptors([...])` in `provideHttpClient`) — the pattern `templates/angular/error.interceptor.ts` uses. On an older project (class-based `HttpInterceptor` + the `HTTP_INTERCEPTORS` multi-provider), adapt the same logic into `intercept()`. |
| **Zoneless** (`provideZonelessChangeDetection`) | `ZoneContextManager` depends on `zone.js`. In a zoneless app, swap it for `new StackContextManager()` from `@opentelemetry/sdk-trace-web` — context propagation across async code gets slightly less precise, but it works with no zone.js at all. |
| **SSR** (`@angular/ssr`) | `TelemetryService.initialize()` must stay guarded by `isPlatformBrowser(inject(PLATFORM_ID))`, as the template already does — the OpenTelemetry Web SDK assumes a browser (`document`, `window`, `navigator`) and breaks on the server render. |
| **`withFetch()`** | Already covered by `FetchInstrumentation` — no extra wiring needed when the project's `HttpClient` uses the Fetch backend instead of `XMLHttpRequest`. |

## 2. Packages

Install the *peer-dep* build of the zone context manager, not the plain one:

```bash
npm install @opentelemetry/api @opentelemetry/context-zone-peer-dep @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/instrumentation @opentelemetry/instrumentation-document-load \
  @opentelemetry/instrumentation-fetch @opentelemetry/instrumentation-user-interaction \
  @opentelemetry/instrumentation-xml-http-request @opentelemetry/resources \
  @opentelemetry/sdk-trace-base @opentelemetry/sdk-trace-web
```

The plain `@opentelemetry/context-zone` package ships its **own** zone.js, separate from the Angular
app's — that's a common source of a "Zone already loaded" warning in the browser console. The
*peer-dep* build reuses the app's existing zone.js instead. A zoneless app needs neither package —
`StackContextManager` ships inside `@opentelemetry/sdk-trace-web` already.

## 3. Registration per version

Angular 19+ (`app.config.ts`):

```ts
providers: [
  // ...
  provideAppInitializer(() => inject(TelemetryService).initialize()),
]
```

Angular 14–18 (the classic token):

```ts
{
  provide: APP_INITIALIZER,
  useFactory: (telemetry: TelemetryService) => () => telemetry.initialize(),
  deps: [TelemetryService],
  multi: true,
}
```

## 4. `propagateTo` and CORS

- List the project's **own** API base URL and, if the SPA calls a token endpoint directly
  (`POST /connect/token` from `auth-server.md` §2), the Auth server's base URL too.
- Explicitly exclude Microsoft/MSAL domains (`login.microsoftonline.com`, `graph.microsoft.com`) and
  any other third party (payment gateways, CDNs) — never add them to `propagateTo`, even implicitly
  through a broad regex.
- The backend's CORS must expose `X-Trace-Id` (`WithExposedHeaders`) and accept `traceparent`/
  `tracestate` if it uses an explicit allowed-headers list.

## 5. Runtime configuration as an alternative

If the target project already configures itself at runtime (`assets/config.json`, `env.js`) instead of
Angular's build-time `fileReplacements`, keep using that mechanism for the observability block too —
don't introduce a second configuration system. `pipeline-secrets.md` covers build-once vs.
per-environment configuration in more detail.

## 6. Local development

Set `observability.enabled: false` in the local environment file (or leave `ingestionKey` as the
placeholder — `TelemetryService.initialize()` already no-ops on an unresolved placeholder). Never put a
real ingestion key in a file that gets committed, even for local development.

## 7. Adapting `ErrorNotificationService` to another UI library

`templates/angular/error-notification.service.ts` is a SweetAlert2 **reference implementation**. Use it
verbatim only when the target project has no notification library yet. Otherwise, keep its public API
(`fromHttpError`/`show`) and swap only the rendering:

| Detected library | System failure (needs a dialog + copy button) | Domain error (a toast is enough) |
|---|---|---|
| `ngx-toastr` | A toast with a longer timeout plus a "copy" action, or a small custom modal component if the library has no built-in dialog | `toastr.warning(message)` |
| Angular Material | `MatDialog` with a component that renders the Trace ID + copy button | `MatSnackBar.open(message)` |
| PrimeNG | PrimeNG's `Dialog` (or `ConfirmDialog`) with the same content | PrimeNG's `Toast`/`MessageService` |
| A custom component | Whatever dialog/modal mechanism the project already has, extended with the Trace ID + copy button | Whatever toast mechanism the project already has |

A system failure needs a **dialog**, not a toast, because the user needs time to read and copy the
Trace ID; a domain error is transient feedback and a toast is enough.

## 8. `SKIP_GLOBAL_ERROR_UI` at custom points

For a call that already handles its own error (e.g. to flag a specific form field), don't remove that
logic — mark the call with `SKIP_GLOBAL_ERROR_UI` (see `templates/angular/error.interceptor.ts`) and
call `ErrorNotificationService.fromHttpError(err)` from inside that local handling, so the Trace ID
still shows up on a system failure without also showing the global interceptor's own notification.
