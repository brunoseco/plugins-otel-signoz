# Test scenarios

Manual regression scenarios for the `otel-signoz` plugin. Each one names the sample repo it expects,
the behavior expected per phase, and its success criteria. Run these against a throwaway sample project
generated outside this repository — never against a real client repository.

## 1. Monorepo: a .NET 8 API + a standalone Angular 19 frontend, no observability yet

- **Sample repo**: a `dotnet new webapi` project and an `ng new` standalone project in the same
  repository, nothing OpenTelemetry-related installed.
- **Expected behavior**: `discovery` finds exactly one `api` and one `ui` service, both with "no
  existing observability". `setup`'s interview runs all 3 rounds in full (nothing to infer). Phase 5
  uses the .NET and Angular templates verbatim (adapted to the project's namespace).
- **Success criteria**: both projects build; the smoke test in Phase 6 shows `X-Trace-Id` on a 200/404
  and `traceId` in a 500 body.

## 2. An API with classic Application Insights

- **Sample repo**: a .NET API with `Microsoft.ApplicationInsights.AspNetCore` already configured and
  sending data to an Application Insights resource.
- **Expected behavior**: `discovery` reports "existing observability: Application Insights (classic
  SDK)". `setup` applies `00-principles.md` §7's adaptation table — it does **not** register a second
  exporter, and only adds the error-contract layer (`Activity.Current` already works unchanged under
  the classic SDK).
- **Success criteria**: no duplicate telemetry pipeline gets added; `X-Trace-Id`/`traceId` still show
  up on error responses.

## 3. Angular, zoneless + SSR

- **Sample repo**: an Angular project with `provideZonelessChangeDetection` and `@angular/ssr` enabled.
- **Expected behavior**: `setup` uses `StackContextManager` instead of `ZoneContextManager` (no
  zone.js-dependent package installed), and keeps the `isPlatformBrowser(inject(PLATFORM_ID))` guard in
  `TelemetryService.initialize()` so it never runs during server-side rendering.
- **Success criteria**: `ng build` (including the server bundle) succeeds; no zone.js package appears
  in `package.json`; the app doesn't throw during SSR.

## 4. A separate OpenIddict Auth server + an SPA using PKCE

- **Sample repo**: an OpenIddict Authorization Server as its own ASP.NET Core project, plus an Angular
  SPA doing an Authorization Code + PKCE flow against it.
- **Expected behavior**: `discovery` classifies the OpenIddict project as `auth`. `setup` instruments it
  like any other backend (`service.name = <base>-auth`), and documents in `docs/observability.md` that
  the browser's redirect to `/authorize` doesn't carry a trace context, while the SPA's
  `POST /connect/token` call does (if the Auth server's URL is in `propagateTo` and its CORS allows
  `traceparent`).
- **Success criteria**: a Trace ID from the SPA's `/connect/token` call matches a span in the Auth
  server; a login problem's investigation guidance in `docs/observability.md` points to searching the
  Auth service by attribute, not by a Trace ID from the SPA.

## 5. A worker using RabbitMQ.Client 6.x

- **Sample repo**: a .NET Worker Service publishing/consuming through `RabbitMQ.Client` 6.x, no native
  OpenTelemetry integration available for that version.
- **Expected behavior**: `setup` uses the manual `MessagingTracePropagation` helper (headers as
  `byte[]`) rather than a native instrumentation package, per `references/messaging-workers.md` §2.
- **Success criteria**: a message published during a traced HTTP request is consumed under a span that
  is a child of that same trace — the same Trace ID appears on both ends.

## 6. An API with a `{ success, message }` envelope that returns an error with HTTP 200

- **Sample repo**: a .NET API whose controllers always return `200 OK`, with a `success: false` field
  in the body signaling a business or system error.
- **Expected behavior**: `discovery` flags "error with HTTP 200: yes". `setup` doesn't change the HTTP
  status without an explicit decision — it adds `traceId` to the envelope and asks whether the frontend
  should treat `success === false` as a system failure in the same notification service, or whether
  this should instead become a tracked migration to correct status codes.
- **Success criteria**: the decision taken is recorded in `docs/observability.md`; whichever path was
  chosen, a Trace ID reaches the user on a genuine system failure that used this envelope shape.

## 7. A project where `NameIdentifier` is an email address

- **Sample repo**: a .NET API using cookie auth, where the `ClaimTypes.NameIdentifier` claim holds the
  user's email address.
- **Expected behavior**: `discovery` flags "user claim: NameIdentifier (can it be an email? yes)".
  `setup` drops that claim from `ResolveUserId`'s fallback chain and uses (or adds) a stable opaque
  internal ID instead.
- **Success criteria**: no span/log ever carries an email address in `enduser.id`.

## 8. A client repository with a different branching convention

- **Sample repo**: any project whose branches don't follow `feature/*`/`develop`/`main` (e.g.
  `trunk`-based, or `release/*` branches).
- **Expected behavior**: `setup`'s Phase 0 asks about the branching convention instead of assuming
  Gitflow, and the Phase 7 PR draft targets whatever pre-production branch the project actually uses.
- **Success criteria**: no branch gets created or assumed that doesn't match the project's own
  convention; the user confirmed it explicitly during Phase 0.

## 9. A Java Spring Boot API + a React frontend (no dedicated reference for either)

- **Sample repo**: a Spring Boot API (Maven) and a Create React App or Vite React frontend, no
  OpenTelemetry configured.
- **Expected behavior**: `discovery` uses the general checklist (`agents/discovery.md` §4) for both,
  and states "no dedicated reference — see `references/other-stacks.md`" for each. `setup`'s Phase 4
  plan flags both implementations as carrying more risk than the .NET/Angular path. Phase 5 implements
  the Java Trace ID exposure via a `@RestControllerAdvice` (auto-instrumentation via the OpenTelemetry
  Java agent for everything else) and the React error-interceptor via an Axios interceptor, following
  `references/other-stacks.md`.
- **Success criteria**: the plugin still produces a working `X-Trace-Id`/`traceId` contract and a
  frontend that shows it only on a system failure, without ever claiming these paths were "compiled and
  smoke-tested" the way the .NET/Angular templates were — `docs/observability.md` says so plainly.
