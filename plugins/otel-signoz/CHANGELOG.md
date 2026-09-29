# Changelog

All notable changes to the `otel-signoz` plugin are documented here. Versions follow SemVer.

## 1.0.0 — Unreleased

Initial build of the plugin.

- Added the `discovery` subagent (read-only inventory of runnable services).
- Added the `setup`, `review`, and `investigate` skills.
- Added `references/` covering principles, the .NET backend, the Auth server, messaging/workers, the
  error contract, the Angular frontend, the pipeline/secrets, troubleshooting, and other stacks.
- Added `templates/` for the .NET backend (compiled and smoke-tested) and the Angular frontend
  (type-checked with `tsc --strict`) — the plugin's one deeply validated reference implementation.
- Added `tests/scenarios.md` with manual test scenarios, including a non-.NET/non-Angular one.

### Notes from building this plugin

- Verified the plugin manifest, marketplace, skill frontmatter, and subagent frontmatter schemas
  against the official Claude Code docs (`plugins-reference`, `plugins/marketplace-reference`,
  `skills`, `sub-agents`) before writing any file. No material divergence found from what the build
  brief assumed.
- Decided against defaulting the Angular error-notification template to one fixed UI library. The
  `setup` skill detects whatever notification library (SweetAlert2, ngx-toastr, Angular Material,
  PrimeNG, or a custom component) the target project already uses and implements the error contract
  on top of it. The bundled `templates/angular/error-notification.service.ts` (SweetAlert2) is a
  reference implementation, used verbatim only for a project with no existing notification library.
- Decided to make the plugin's process stack-agnostic rather than .NET/Angular-only. `discovery`,
  `setup`, and `review` detect whatever backend language/framework and frontend framework the target
  repository actually uses (Java, Node.js, Python, Go, React, Vue, ...), and apply the same principles
  from `references/00-principles.md` to it. The .NET + Angular templates stay as the one deeply
  validated, compiled-and-smoke-tested reference implementation; `references/other-stacks.md` covers
  the general approach (OpenTelemetry auto-instrumentation per language, and how to reshape the error
  contract) for everything else, without pretending to have tested templates for languages this plugin
  hasn't actually built and run.

### Template validation (2026-09-28)

- **.NET**: `dotnet new webapi -f net8.0`, added `OpenTelemetry.Extensions.Hosting` 1.19.1,
  `OpenTelemetry.Exporter.OpenTelemetryProtocol` 1.19.1, `OpenTelemetry.Instrumentation.{AspNetCore,
  Http,Runtime,SqlClient}` 1.19.0 — none required `--prerelease`, confirming the SqlClient package is
  stable. `dotnet build -warnaserror` → 0 warnings, 0 errors. Runtime smoke test confirmed
  `X-Trace-Id` on 200/404/500 responses, `traceId` in the body of both a custom 500 handler and an
  automatic `[ApiController]` 400 (via `AddTraceIdToProblemDetails`) matching the header exactly, and
  the app starting normally with tracing active but export disabled when no endpoint/key is set.
- **Angular**: `tsc --noEmit --strict` passed (exit code 0) against `@angular/core` 22.2.0,
  `@opentelemetry/*` 2.11.0, `sweetalert2` 11.26.25, and TypeScript 7.0.2 — newer than the "Angular
  19.2 + OpenTelemetry JS 2.11" combination noted as validated in the build brief, superseding it with
  fresher evidence. The OpenTelemetry JS major/minor (2.11) is unchanged; only Angular and TypeScript
  moved forward, and the templates needed no changes for it.

### Manifest and end-to-end validation (2026-09-29)

- `claude plugin validate ./plugins/otel-signoz --strict` and `claude plugin validate . --strict`
  (Claude Code 2.1.284) both passed with no errors or warnings.
- Ran the plugin live with `claude --plugin-dir ./plugins/otel-signoz` against a disposable sample
  repository (a minimal .NET 8 API + a deliberately partial Angular 19 skeleton, to also exercise the
  "can't fully build the frontend" path):
  - `/otel-signoz:review` produced the full report format (a 3-line executive summary, the
    Severity/Item/Evidence/Fix/Effort table, and next steps by severity), correctly flagging every
    missing piece of observability and the broken frontend scaffold, without saving a file (as
    designed, since saving wasn't requested).
  - `/otel-signoz:setup` correctly stopped at the Phase 2 gate with the inventory table and its own
    numbered pending questions when run with no interactive answering available (the documented
    fallback for when `AskUserQuestion` isn't usable). Given the interview's answers directly, it
    correctly used the SweetAlert2 template as-is because the sample project already declared that
    dependency, generated a fully filled-in `docs/observability.md`, produced the Phase 4 file-by-file
    plan citing the correct references and templates, and stopped exactly there as instructed —
    without touching Phase 5.
