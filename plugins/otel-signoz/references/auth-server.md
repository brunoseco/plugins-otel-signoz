# Auth — an Authorization Server as its own process

If authentication is just token validation inside the API (a JWT bearer, a local
`OpenIddict.Validation`), there's no separate Auth service — it's part of the API. This guide applies
when Auth is a **process with its own deployment**, as it typically is when the API, the UI, and Auth
are shipped as separate artifacts.

## 1. Instrumentation

| Auth | What to do |
|---|---|
| Custom .NET code (Duende/IdentityServer4/OpenIddict.Server) | Same treatment as the API (`dotnet-backend.md`), `service.name = <base>-auth`, the error contract on its own endpoints (login screens, custom `/connect/*` endpoints). |
| Custom code in another language (Java Spring Authorization Server, a Node OIDC provider) | Same principle from `references/other-stacks.md`, `service.name = <base>-auth`. |
| Self-hosted Keycloak | Has native OTel tracing support from certain versions on — confirm the version first. Configure the endpoint/headers through the container's environment variables. |
| Auth0 / Okta / Entra ID (SaaS) | Doesn't export OTel. A separate source (Auth0 Log Streams, Okta's System Log, Entra sign-in logs). Document the limitation; don't force a correlation that doesn't exist. |

A process that is both a data backend and an Authorization Server at the same time is one service:
one instrumentation, one `service.name` (pick the dominant role during the interview).

## 2. Where the trace actually carries through — and where it doesn't

| Flow | Does the frontend's trace continue into Auth? |
|---|---|
| The browser is redirected whole-page to `/authorize` (Authorization Code flow, with or without PKCE) | **No.** A full-page navigation, not an instrumented `fetch`/`XHR` call: `traceparent` doesn't travel across it. Auth opens its own trace. |
| The SPA exchanges a `code` for a token via `POST /connect/token` (a `fetch`/`XHR` call) | **Yes**, as long as Auth's URL is in the frontend's `propagateTo` list and its CORS accepts `traceparent`/`tracestate`. |
| The API calls Auth through an instrumented HTTP client (introspection, JWKS, refresh, client credentials) | **Yes, automatically**, as long as Auth is instrumented too. |
| Local token validation (signature/expiry check against a cached key) | No network call — nothing to correlate. |

Operational conclusion (record it in `docs/observability.md`): a **login** problem gets investigated
in the `<base>-auth` service by attribute (client ID, an approximate time window, the attempted user —
never log the password), not by a Trace ID inherited from the SPA. An error **after** login correlates
normally, frontend → API → SQL.

## 3. Specific care

- Never log `Authorization`, cookies, `code`, `refresh_token`, `client_secret`, or the
  `/connect/token` body. The default instrumentation doesn't capture headers/bodies — don't add an
  enricher that would.
- Entra ID / MSAL on the frontend: `login.microsoftonline.com`, `graph.microsoft.com`, and related
  domains stay **out** of `propagateTo` (a refused CORS preflight breaks login).
- Auth's own error page (Razor/MVC or equivalent, not the SPA): apply the same support pattern with a
  Trace ID (`error-contract.md` §4), since it never goes through the Angular interceptor.
