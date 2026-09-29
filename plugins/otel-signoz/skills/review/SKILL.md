---
name: review
description: Read-only audit of OpenTelemetry -> SigNoz observability in the current repository against the otel-signoz plugin's checklist — trace/error-contract coverage, propagation scope, secrets, sampling, and cost — for any backend/frontend language or framework. Produces a findings report ranked by severity, with evidence, a fix, and an effort estimate.
argument-hint: "[optional path to limit the scope, e.g. src/Api]"
---

# /otel-signoz:review

A **read-only** audit. Never edit application code during this skill. Optional scope the user
provided: `$ARGUMENTS` (empty = the whole repository).

## 1. Gather the inventory

Delegate to the **`otel-signoz:discovery`** subagent (scope = `$ARGUMENTS` or the repository root). If
it isn't available, do the discovery yourself following `${CLAUDE_PLUGIN_ROOT}/agents/discovery.md`.

## 2. Evaluate the checklist

Read `${CLAUDE_PLUGIN_ROOT}/references/00-principles.md` first — every item below is one of its rules
made concrete and checkable. For a service on a stack without a dedicated reference
(see `${CLAUDE_PLUGIN_ROOT}/references/other-stacks.md`), evaluate the same items using that
ecosystem's own idiom for each one — a checklist item never stops applying just because the service
isn't .NET or Angular.

### Checklist

- [ ] Outbound HTTP calls reuse a pooled/shared client instead of creating one per call (e.g.
      `IHttpClientFactory` in .NET, a shared client/agent bean in Java/Node/Go)
- [ ] No empty or swallowed `catch`/`except`/`rescue` block
- [ ] `traceId` is present on every error response, and `X-Trace-Id` is exposed through CORS
- [ ] The frontend shows the Trace ID only on a genuine system failure — never on an expected domain
      response (`error-contract.md` §2)
- [ ] The message shown to the user exposes no internal structure (a table/column/procedure name, a
      stack trace)
- [ ] An Auth server running as its own process has its own instrumentation — it doesn't inherit the
      API's automatically (`auth-server.md`)
- [ ] Trace propagation (`traceparent`/`tracestate`) is restricted to this project's own services —
      never a third-party domain
- [ ] `enduser.id` is a stable, opaque identifier — never an email, a national ID, or a name
- [ ] Every worker/queue consumer/scheduled function has its own observability configuration — it
      doesn't inherit the API's just by being "close" to it in the architecture
- [ ] `service.name` carries no environment suffix (`-dev`, `-hml`, `-prod`)
- [ ] `deployment.environment` (and `deployment.environment.name`) is present and set to one of the
      three canonical values
- [ ] `service.version` is injected by CI/CD, not hardcoded
- [ ] No real secret value is committed anywhere in the repository — if one is found, report only its
      **key name**, never the value
- [ ] The SQL/database instrumentation does **not** capture bound parameter values (the equivalent of
      .NET's `SetDbQueryParameters`, left off)
- [ ] The sampling rate matches the support promise: 100%, or an explicit, documented trade-off if it's
      lower (`00-principles.md` §6)
- [ ] Health checks, Swagger/OpenAPI UI, and static assets are filtered out of traces
- [ ] No error is returned with an HTTP 200 status
- [ ] Missing dashboards/alerts are flagged as technical debt, not silently ignored

## 3. Produce the report

Structure:

1. A 3-line executive summary at the top (what's solid, what's the biggest gap, the overall risk
   level).
2. A findings table:

   | Severity | Item | Evidence (file:line) | Fix | Effort |
   |---|---|---|---|---|

   Severity is one of `Critical`/`High`/`Medium`/`Low`; Effort is one of `S`/`M`/`L`. Cite real
   `file:line` evidence for every finding — never a generic claim with no location.
3. Next steps, ordered by severity.

Only write `docs/observability-review.md` if the user explicitly asks for the report to be saved;
otherwise just present it in the response.
