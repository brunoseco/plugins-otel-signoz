# plugins-otel-signoz

Personal Claude Code plugin marketplace (`brunoseco`). Currently ships one plugin: **otel-signoz**.

## What this is

`otel-signoz` is a Claude Code plugin that rolls out (or audits) OpenTelemetry → SigNoz observability
across a typical two-tier stack: a backend (API, Auth server, workers/queues, background jobs) and a
frontend — in whatever language or framework the target repository actually uses. It discovers the
runnable services in a repository, interviews the team to confirm service names and environment mapping,
instruments traces/logs/metrics, and closes the loop so that every Trace ID shown to a user on a
system-failure error screen can actually be found in SigNoz — end to end, from the click in the browser
to the SQL query or queue message that failed.

The plugin ships one deeply validated reference implementation — a .NET backend + an Angular frontend,
with templates that compile and have been smoke-tested — plus stack-agnostic principles and guidance so
the same result can be reached in another backend language (Java, Node.js, Python, Go, ...) or frontend
framework (React, Vue, ...), adapting the .NET/Angular templates as a worked example rather than copying
them verbatim.

See [`plugins/otel-signoz/README.md`](plugins/otel-signoz/README.md) for the full plugin documentation.

## Install

This repository is **private** — anyone installing the plugin needs read access to it first.

```
/plugin marketplace add brunoseco/plugins-otel-signoz
/plugin install otel-signoz@brunoseco
```

## Skills

| Command | What it does |
|---|---|
| `/otel-signoz:setup` | Rolls out observability end to end in the current repository. Only runs when you invoke it. |
| `/otel-signoz:review` | Read-only audit against the plugin's checklist; produces a findings report. |
| `/otel-signoz:investigate` | Investigates an incident via the SigNoz MCP server (trace ID, symptom, or slowness). |

## Roadmap (out of scope for v1)

- **Shared library** — extract the templates into versioned packages (a NuGet package and an npm
  package) in a private feed, once 3+ projects use them (drift cost outweighs packaging cost). The
  plugin would install the package where allowed and keep the template mode for repositories that
  can't pull from an external feed.
- **Secret-guard hook** — block committing a literal ingestion key to a versioned file, after the
  plugin has been piloted on a few repositories.
- **Plugin evals** — check support for `claude plugin eval` and turn `tests/scenarios.md` into
  automated eval cases.
- **Default SigNoz dashboards and alerts** — 5xx rate per service, p95 per route, errors per version.

## License

Personal project, all rights reserved unless stated otherwise.
