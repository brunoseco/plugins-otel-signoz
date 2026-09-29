# otel-signoz

A Claude Code plugin that rolls out, audits, and helps investigate OpenTelemetry → SigNoz observability
in a backend + frontend codebase, in whatever language or framework it's written in. Ships a deeply
validated .NET + Angular reference implementation; other stacks follow the same principles (see
[`references/other-stacks.md`](references/other-stacks.md)).

## What it does

1. **Discovers** the runnable services in the current repository — APIs, an Auth server, workers /
   queue consumers / background jobs, and frontends — regardless of their language or framework.
2. **Interviews** the team to confirm each service's name (`<base>-api`, `<base>-auth`, `<base>-ui`, ...),
   the environment mapping, the secret strategy, the support channel, and the sampling rate.
3. **Instruments** traces, logs, and metrics via OpenTelemetry → SigNoz, with a `service.name` that stays
   identical across environments — the environment itself is carried in `deployment.environment`, never
   concatenated into the name.
4. **Closes the Trace ID loop**: the backend returns a Trace ID on every error response; the frontend
   shows the Trace ID, a copy button, and support guidance **only on a genuine system failure**, so the
   same ID can be traced from the frontend through the API, the Auth server, and SQL/queues.
5. **Audits** projects that already have some observability in place, and **helps investigate** incidents
   through the SigNoz MCP server.

## Skills

- **`/otel-signoz:setup`** — rolls out (or completes) observability end to end. Only you can invoke it;
  it changes code, so it never runs on its own. See [`skills/setup/SKILL.md`](skills/setup/SKILL.md).
- **`/otel-signoz:review`** — read-only audit against the checklist in
  [`skills/review/SKILL.md`](skills/review/SKILL.md). Can run automatically when relevant.
- **`/otel-signoz:investigate`** — investigates an incident through the SigNoz MCP server. See
  [`skills/investigate/SKILL.md`](skills/investigate/SKILL.md).

## Prerequisites in the target repository

- The target project's own toolchain already installed (the .NET SDK for a .NET backend — see
  [`references/dotnet-backend.md`](references/dotnet-backend.md) for what changes per version — a JDK
  for Java, Node.js for a Node backend or an Angular/React/Vue frontend, etc.).
- For a stack without a dedicated reference in this plugin, see
  [`references/other-stacks.md`](references/other-stacks.md) for the OpenTelemetry auto-instrumentation
  option for that language and how to adapt the error-contract shape to it.
- A SigNoz account (Cloud or self-hosted) for the project/client, with an ingestion key for writing
  and, for `/otel-signoz:investigate`, a read API key.
- Git, with the target repository already following some branching convention — `setup` asks rather
  than assumes.

## Known limitations

- No SigNoz MCP server ships with the plugin (v1) — `/otel-signoz:investigate` detects whether one is
  configured in the session and walks you through setting it up otherwise, since a SigNoz account is
  per client/project and bundling one server would prompt every user for auth.
- Head-based sampling below 100% breaks the "every Trace ID shown to a user exists in SigNoz"
  guarantee. The plugin defaults to 100% and documents the trade-off if you choose a lower rate.
- A browser login redirected through a full-page Authorization Code flow doesn't carry a trace
  context across that redirect — a structural limitation of page navigation, not a plugin bug.
- SigNoz Cloud has no data-residency region in Brazil (only US, EU, and India) — the plugin flags
  this during setup so you can check it against the target client's data-residency requirements.

## Roadmap

See the repository root [`README.md`](../../README.md#roadmap-out-of-scope-for-v1).
