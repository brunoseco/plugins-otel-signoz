<!--
otel-signoz plugin template. The `setup` skill generates this file in the TARGET repository at
docs/observability.md, filling in every placeholder from the interview and the discovery inventory.
On a later run, `setup` reads this file back instead of asking again (the "complement" mode).
-->

# Observability

This document records how OpenTelemetry → SigNoz observability is set up in this repository, so the
next person (or the next run of the `otel-signoz` plugin) doesn't have to rediscover it.

## Service map

| Service | `service.name` | Type | Path | Repository |
|---|---|---|---|---|
| __SERVICE_ROW__ | | | | |

Base / `service.namespace`: `__BASE__`

Services that participate in this flow but live **outside this repository** (run the plugin there too,
reusing these same names):

- __EXTERNAL_SERVICE_OR_NONE__

## Environments

| Environment name in this repo | Canonical `deployment.environment` |
|---|---|
| __DETECTED_ENV_NAME__ | development \| homolog \| production |

## Where the configuration lives

- Backend: __BACKEND_CONFIG_LOCATION__
- Frontend: __FRONTEND_CONFIG_LOCATION__

## Secrets

Names only — never a value in this file or anywhere else versioned.

| Secret | Where it lives | Key/variable name |
|---|---|---|
| Backend ingestion key | __BACKEND_SECRET_LOCATION__ | __BACKEND_SECRET_NAME__ |
| Frontend ingestion key(s) | __FRONTEND_SECRET_LOCATION__ | __FRONTEND_SECRET_NAME__ |

## Error contract

- Header: `X-Trace-Id` on every error response.
- Body field: `__ERROR_FIELD_NAME__` (default `traceId`; a different name only if the project already
  had a correlation field and chose to keep it — see `references/error-contract.md`).
- The frontend shows the Trace ID + copy button + support guidance only for a system failure: status
  `0` or any status outside `400, 401, 403, 404, 422, 429`.
- Support channel shown to the user: __SUPPORT_CHANNEL__.

## How to investigate

- **Have a Trace ID?** Use `/otel-signoz:investigate <trace-id>` — it walks the full span tree.
- **Only a symptom?** `/otel-signoz:investigate <description>` — it searches error logs in the
  approximate window and finds the Trace ID from there.
- **A login problem?** Investigate in the `__AUTH_SERVICE_NAME__` service by attribute (client ID,
  approximate time, the attempted user) — a Trace ID from the SPA never reaches a full-page login
  redirect.

## Known limitations

- A full-page redirect to an Authorization Code login flow doesn't carry a trace context across the
  redirect — this is a structural limitation of page navigation, not a bug.
- __AUTH_SAAS_LIMITATION_OR_NONE__ (e.g., "Auth0/Okta don't export OTel — investigate login issues in
  their own log stream instead" if the Auth provider is a closed SaaS product).

## Decisions

| Decision | Value | Why |
|---|---|---|
| Sampling (production) | __SAMPLING_RATIO__ | __SAMPLING_RATIONALE__ |
| SigNoz account | __SIGNOZ_ACCOUNT__ | dedicated to this client/project: __DEDICATED_YES_NO__ |
| Data residency | __SIGNOZ_REGION__ | __DATA_RESIDENCY_NOTE_OR_NONE__ |

## Plugin run history

| Date | Plugin version | Scope | Notes |
|---|---|---|---|
| __RUN_DATE__ | __PLUGIN_VERSION__ | __RUN_SCOPE__ | __RUN_NOTES__ |
