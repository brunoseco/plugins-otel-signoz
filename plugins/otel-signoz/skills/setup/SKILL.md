---
name: setup
description: Rolls out (or completes) OpenTelemetry -> SigNoz observability in the current repository — discovers backend APIs, an Auth server, workers/queues/background jobs, and frontends in whatever language or framework they're written in, asks for each service's name and the environment mapping, instruments traces/logs/metrics with deployment.environment, and closes the Trace ID loop all the way to the error screen (a copy button + support guidance).
argument-hint: "[optional path to limit the scope, e.g. src/Api]"
disable-model-invocation: true
---

# /otel-signoz:setup

You're about to roll out observability end to end (frontend → API → Auth → SQL/queues) in this
repository. Optional scope the user provided: `$ARGUMENTS` (empty = the whole repository).

Before anything else, read **`${CLAUDE_PLUGIN_ROOT}/references/00-principles.md`**. It holds the
non-negotiable rules; no implementation decision may contradict it. The other references are read on
demand, in whichever phase actually needs them.

Follow the phases **in order**. A **⏸ STOP** marker requires an explicit reply from the user before
continuing. Use the `AskUserQuestion` tool for questions whenever it's available (clickable options, up
to 4 questions per call); without it, ask in numbered text instead. Always bring a **suggestion** —
the user only needs to confirm or correct it.

---

## Phase 0 — Pre-flight

1. `git status --porcelain`: if there are uncommitted changes, flag it and ask whether to continue.
2. Branch: ask which branching convention this repository follows (many follow something like
   `feature/<TICKET>-observability-otel` off `main`, PR → a staging/homolog branch → `main`, but never
   assume — a client repository may use a different convention). Never work directly on a shared
   protected branch without the user's explicit go-ahead.
3. If `docs/observability.md` already exists from a previous run, read it: it's the already-decided
   contract of names and environments — reuse it instead of asking again (the "complement" mode).

## Phase 1 — Discovery (read-only)

Delegate to the **`otel-signoz:discovery`** subagent (scope = `$ARGUMENTS` or the repository root). It
returns a standardized inventory per runnable service, covering whatever language/framework each one
is written in — this is not limited to .NET or Angular. Don't change anything in this phase.

If the subagent isn't available, do the discovery yourself following
`${CLAUDE_PLUGIN_ROOT}/agents/discovery.md`.

## Phase 2 — Validate the inventory ⏸ STOP

Show a compact table:

| # | Type | Path | Stack/version | Existing observability | Suggested name |
|---|------|------|----------------|-------------------------|----------------|

Possible types: `api`, `auth`, `worker`, `func` (a scheduled/serverless job, any platform), `svc`
(a microservice), `ui`, `gateway`. Ask: is the inventory correct? Is there a service in **another
repository** that's part of the flow (e.g. an Auth server in a separate repo)? If so, record it in the
Phase 4 document as "outside this repository" — the plugin should be run there too later, reusing the
same names.

If a service **already has** OpenTelemetry/Application Insights/Datadog/Elastic, apply the adaptation
table from `${CLAUDE_PLUGIN_ROOT}/references/00-principles.md` §7 (inherit, don't replace) and confirm
with the user before continuing.

## Phase 3 — Interview ⏸ STOP

Ask **only what can't be inferred** from the inventory. Group it into at most 3 rounds.

**Round A — global**
1. **Base name / namespace** for the system (a suggestion derived from the solution/repo name,
   kebab-case, e.g. `intranet`). Becomes `service.namespace` and the prefix for every service name.
2. **SigNoz destination**: Cloud (region `us`, `eu`, or `in`) or self-hosted (a URL). And: is the
   account **dedicated to this client/project**? (If it's shared across clients, flag it —
   `00-principles.md` §5.)
3. **Environment mapping**: show the names found in the repository (`ASPNETCORE_ENVIRONMENT`,
   `appsettings.*.json`, `environment.*.ts`, workflow files, or that stack's own equivalent) and a
   suggested mapping onto the three canonical values `development` | `homolog` | `production`.
4. **Backend secret strategy**: whatever local-secret mechanism and deploy-time mechanism (a vault, an
   injected environment variable) fits the detected stack — mention what pattern, if any, the
   repository already uses for other secrets, and default to matching it.

**Round B — each service's name** (one question per service, in batches of up to 4)
- Suggestion: `<base>-api`, `<base>-auth`, `<base>-ui`, `<base>-worker-<name>`, `<base>-func-<name>`,
  `<base>-svc-<name>`. Offer the suggestion and one alternative; the user can type another.
- Rule: lowercase, kebab-case, **no environment suffix** (`-dev`, `-hml`, `-prod` are forbidden — the
  environment goes in `deployment.environment`). Refuse and explain if the user asks for a suffix.

**Round C — error contract, support, and cost**
1. **Support channel** shown on the error screen: an email (which one?) · a ticket-opening URL · both.
2. **Custom error-handling points** found (list the main ones with `file:line`): fix the central one +
   the top N listed (recommended) · all of them · only the central one.
3. **Production sampling**: 100% (recommended — guarantees every Trace ID shown to the user exists in
   SigNoz) · 50% · 10%. Explain the trade-off in one line (`00-principles.md` §6).
4. Only if an existing correlation field was detected (`correlationId`, `requestId`): keep the existing
   name, or standardize on `traceId`?

## Phase 4 — Plan ⏸ STOP

1. Generate `docs/observability.md` from `${CLAUDE_PLUGIN_ROOT}/templates/docs/observability.md`, with
   the interview's decisions (the service map, environments, the error contract, secrets, how to
   investigate).
2. Present the plan **file by file**, grouped by service: file · action (create/edit) · reason.
   Include the packages to install and the proposed pipeline changes. For any service on a stack
   without a dedicated reference (see the table below), say so explicitly and flag that its
   implementation carries more risk than the .NET/Angular path and deserves closer review.
3. Wait for explicit approval.

## Phase 5 — Implementation

Order: **API → Auth → workers/funcs/svc → UI → custom error-handling points → pipeline**. One service
at a time; build it before moving to the next.

| Service | Required reference | Templates |
|---|---|---|
| API / svc — **.NET** | `${CLAUDE_PLUGIN_ROOT}/references/dotnet-backend.md` | `templates/dotnet/ObservabilityConfiguration.cs`, `TraceIdResponseExtensions.cs` |
| API / svc — **any other backend language** | `${CLAUDE_PLUGIN_ROOT}/references/other-stacks.md` | none — implement directly, using the .NET templates as a worked example of the same shape |
| Auth | `${CLAUDE_PLUGIN_ROOT}/references/auth-server.md` | same as the matching backend row above |
| Worker / queue / scheduled job | `${CLAUDE_PLUGIN_ROOT}/references/messaging-workers.md` | `ObservabilityConfiguration.cs` (no `[WEB]` block) + `MessagingTracePropagation.cs` for .NET; `other-stacks.md` otherwise |
| Error contract (backend + frontend) | `${CLAUDE_PLUGIN_ROOT}/references/error-contract.md` | `TraceIdResponseExtensions.cs`, `angular/*` for the reference stack |
| UI — **Angular** | `${CLAUDE_PLUGIN_ROOT}/references/angular-frontend.md` | `templates/angular/*` |
| UI — **any other frontend framework** | `${CLAUDE_PLUGIN_ROOT}/references/other-stacks.md` §2 | none — port the Angular templates' logic (most of it has no Angular dependency; see the table in `other-stacks.md`) |
| Pipeline and secrets | `${CLAUDE_PLUGIN_ROOT}/references/pipeline-secrets.md` | — |

Templates live in `${CLAUDE_PLUGIN_ROOT}/templates/`. Copy them, replace the `__NAMESPACE__`,
`__SERVICE_NAME__`, etc. placeholders, and **adapt them to the project's own style** (namespaces,
folders, naming conventions). Never paste a template that conflicts with something existing — compose
instead.

Rules during implementation:
- **Compose, don't rewrite**: an existing global handler, interceptor, CORS policy, or
  `CustomizeProblemDetails` (or that stack's equivalent) gets extended, preserving all of its current
  logic.
- **No frontend notification library is assumed.** Detect whichever one the project already uses
  (SweetAlert2, ngx-toastr, Angular Material, PrimeNG, a custom component, or — for another framework —
  its own dialog/toast mechanism) and implement the error contract on top of it, following
  `angular-frontend.md` §7 or `other-stacks.md` §2. Use the bundled SweetAlert2 template verbatim only
  when the project has no notification library at all yet.
- **Zero secrets in a versioned file.** Local: that language's local-secret mechanism. Deploy: a vault
  or an injected environment variable. Frontend: the `__SIGNOZ_INGESTION_KEY__` placeholder,
  substituted by the pipeline.
- Pipeline files (`.github/workflows`, `azure-pipelines*.yml`, or equivalent): **propose the diff and
  ask before editing** — CI/CD is governed separately.
- If a package doesn't resolve for the project's installed framework version, stop and report it; don't
  force a framework upgrade just to fit the instrumentation.

## Phase 6 — Verification

1. Run each changed project's own build command (`dotnet build`, `npm run build`/`npx ng build`, `mvn
   package`, `go build`, or whatever the detected stack uses).
2. Run the existing test suite if it's fast (`dotnet test`, a non-watch frontend test run, etc.); ask
   first if the suite is slow.
3. Optional smoke test (ask first): start the API locally and call a route that doesn't exist plus one
   that produces an error → confirm the `X-Trace-Id` header and the `traceId` field in the body.
4. Mentally run the checklist from `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` (the Checklist
   section) and fix whatever's missing.

## Phase 7 — Delivery

1. A summary table: service · `service.name` · what got instrumented · files changed.
2. Explicit manual follow-ups: secrets to create in the vault/CI secrets store, App Service/deploy
   variables, CORS changes per environment, SigNoz accounts.
3. Small commits, one per service.
4. A draft PR description, targeting whatever the repository's normal pre-production branch is (its
   own convention, confirmed in Phase 0 — never assume `develop`). **Never push or open a PR without
   confirmation.**
5. Remind the user: validate in staging/homolog by finding a real Trace ID in SigNoz before the PR
   into the main/production branch.
