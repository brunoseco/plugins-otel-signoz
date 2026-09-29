---
name: investigate
description: Investigates an incident using the SigNoz MCP server — walks a Trace ID's full span tree, finds the traceId from an ERROR log when there's only a symptom, separates out where the time went on a slow request, correlates frontend and backend spans, and knows a login problem gets investigated in the Auth service by attribute, not by a Trace ID inherited from the SPA.
argument-hint: "[a trace ID or a description of the symptom]"
---

# /otel-signoz:investigate

User-provided context: `$ARGUMENTS` (a Trace ID, or a description of the symptom).

## 1. Confirm the SigNoz MCP server is available

Check whether this session has `mcp__signoz__*` tools. If it doesn't, walk the user through setting
one up instead of trying to work around it:

1. `claude mcp add --scope user --transport http signoz https://mcp.<region>.signoz.cloud/mcp` — the
   region in the URL must match the SigNoz account's own region (`us`, `eu`, or `in`; a self-hosted
   instance uses its own URL instead).
2. The instance URL and a **read** API key — never the ingestion key, which only writes.
3. A **new session** is required after authorizing; the tools won't appear in the current one.

## 2. Before any broad search

Confirm the SigNoz account in use is **dedicated to this client/project**, not shared across clients —
if it's shared, be careful not to let a broad, unfiltered search surface another client's data
(`00-principles.md` §5). Prefer resource-attribute filters (`service.name`, `deployment.environment`)
over a keyword search across everything.

## 3. Pick the flow that matches the input

**Flow 1 — a Trace ID is known**
Fetch that trace's full span tree (the request received → outbound calls/queries → exactly where it
failed). This is usually the fastest path — prefer it whenever a Trace ID exists.

**Flow 2 — only a symptom, no Trace ID** (e.g. "screen X errored out this morning")
Search `ERROR`-severity logs for the affected service in the approximate time window, cross-referencing
`http.url`/`http.status_code` attributes if the target project followed `error-contract.md`. Pull the
`traceId` from a matching log entry and continue with Flow 1.

**Flow 3 — suspected slowness** (not an error)
Look at span duration by route/service in the time window; separate out whether the bottleneck is the
database, an external HTTP call, or the service's own processing.

**Flow 4 — frontend↔backend correlation**
If the symptom started in the browser, the same Trace ID should have both a frontend span
(`fetch`/`xhr`) and a backend one. Ask for both sides — don't stop at the backend alone.

**Flow 5 — a login problem**
Investigate in the `<base>-auth` service by attribute (a client ID, an approximate time window, the
attempted user — never log a password), not by a Trace ID inherited from the SPA. A full-page redirect
to `/authorize` never carries a trace context across it (`auth-server.md` §2) — this is expected, not a
bug to chase.

## 4. Things to watch for

- A service with no instrumentation simply won't show up in SigNoz — that's a coverage gap to report,
  not a bug in the MCP server or this skill.
- Never paste more personal data from a span/log into the chat than the investigation actually needs.

## 5. Output

- A timeline of the trace (or the relevant logs, if no full trace exists).
- A probable cause, backed by concrete evidence (a span, a log line, an attribute value).
- Next steps.
- A draft response to the user/support team that states the cause and the fix at a level someone
  outside the team can act on, without exposing internal implementation detail (a table name, a stack
  trace, a query).
