# .NET backend — API, Auth server, and HTTP microservices

This is the plugin's deeply validated reference implementation for a backend. If the target service is
in another language, apply `references/other-stacks.md` instead, using this file as a worked example of
the same shape.

## 1. Compatibility

| Target | How to apply the template |
|---|---|
| .NET 8, 9, 10 | `ObservabilityConfiguration.cs` as-is (`IHostApplicationBuilder`). |
| .NET 6, 7 | Swap `IHostApplicationBuilder` for `WebApplicationBuilder` (a worker: `IHostBuilder` + `ConfigureServices`/`ConfigureLogging`). `TraceIdResponseExtensions.AddTraceIdToProblemDetails` requires .NET 7+; on .NET 6 omit it — the frontend already normalizes the W3C format. |
| .NET Core 3.1 / 5 / `Startup.cs` | An extension taking `IServiceCollection` + `IConfiguration` + `IHostEnvironment`, called from `ConfigureServices`; logging through `ConfigureLogging` in `Program`. |
| .NET Framework 4.x | Outside this plugin's automatic scope. Report it and ask. |

## 2. Packages

```bash
dotnet add package OpenTelemetry.Extensions.Hosting
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
dotnet add package OpenTelemetry.Instrumentation.AspNetCore     # API/Auth server only
dotnet add package OpenTelemetry.Instrumentation.Http
dotnet add package OpenTelemetry.Instrumentation.Runtime
dotnet add package OpenTelemetry.Instrumentation.SqlClient                # SQL Server (stable) (ADO.NET, Dapper, EF Core SqlServer)
# EF Core with another provider (Npgsql/MySql):   OpenTelemetry.Instrumentation.EntityFrameworkCore --prerelease
# Redis:                                          OpenTelemetry.Instrumentation.StackExchangeRedis --prerelease
```

Verified in this plugin's own build (September 2026): `Extensions.Hosting` 1.19.1,
`Exporter.OpenTelemetryProtocol` 1.19.1, and `Instrumentation.{AspNetCore,Http,Runtime,SqlClient}`
1.19.0 all resolved as **stable**, with no `--prerelease` flag needed — confirmed by a clean
`dotnet build -warnaserror`. `EntityFrameworkCore`, `Hangfire`, and `StackExchangeRedis` were still
beta-only at that point; check the current state on NuGet before installing them.

- Use the same major/minor for every `OpenTelemetry.*` package in the project.
- If the project uses **Central Package Management** (`Directory.Packages.props`), add the versions
  there.
- A project on **net6/net7**: check the minimum `TargetFramework` each package's latest version still
  supports before installing; if it doesn't, pin the latest compatible version and record that in
  `docs/observability.md`.

## 3. Registering it in `Program.cs`

```csharp
builder.AddObservability();                    // after AddAuthentication/AddAuthorization, before Build()
builder.Services.AddTraceIdToProblemDetails(); // .NET 7+
var app = builder.Build();

app.UseTraceIdHeader();                        // early in the pipeline, before the exception handler
app.UseExceptionHandler(...);                  // whatever the project already uses — just add the traceId (error-contract.md)
```

Extras per service through the callbacks:

```csharp
builder.AddObservability(
    tracing => tracing.AddSource("Azure.*").AddRedisInstrumentation(),
    metrics => metrics.AddMeter("MyApp.Business"));
```

## 4. Configuration

Merge in `templates/dotnet/appsettings.Observability.snippet.jsonc`. Rules:
- An explicit `Environment` in each `appsettings.{Env}.json`, with the canonical value decided during
  the interview.
- `IngestionKey` never in a file. Local: `dotnet user-secrets` (create a `UserSecretsId` if the
  project doesn't have one yet). Deploy: see `pipeline-secrets.md`.
- `ServiceVersion` normally doesn't go in a file: it comes from CI/CD
  (`Observability__ServiceVersion`) or from the `InformationalVersion` baked in at build time
  (`-p:InformationalVersion=$VERSION`).

## 5. SQL

- `AddSqlClientInstrumentation` covers both `Microsoft.Data.SqlClient` and `System.Data.SqlClient`
  (raw ADO.NET, Dapper, and EF Core's SqlServer provider), including stored procedures.
- **SQL command text**: check the installed version's options for whether the text is captured and
  what the default is. Parameterized SQL is safe; string-concatenated SQL with values baked in
  (legacy code) sends data into the span — in that case **don't** enable text capture, and report
  those call sites (they're also a SQL-injection risk).
- **`SetDbQueryParameters` stays off, always** (the default): parameter values are potential personal
  data.
- `EnableTraceContextPropagation`: check the installed version's default and cost; only enable it with
  a reason.

## 6. Auth and `enduser.id`

- The template enriches at the **end** of the request (`EnrichWithHttpResponse`): at the start, the
  authentication middleware hasn't run yet and `HttpContext.User` is anonymous — enriching on the
  request doesn't work.
- Check which claim the project actually uses. If `NameIdentifier` is an email/login (common with
  cookie auth), drop it from `ResolveUserId`'s fallback chain and use the internal ID instead.

## 7. Known pitfalls

- **Serilog** replacing the logging pipeline (`UseSerilog()`/`AddSerilog(dispose: true)`): logs may
  not flow through the OpenTelemetry provider. Options: `writeToProviders: true` on `UseSerilog`, or
  the `Serilog.Sinks.OpenTelemetry` sink. Make sure logs carry the current trace/span ID (an
  `Activity`-based enricher).
- **Application Insights** already registered: don't register a second exporter for the same signal
  without an explicit decision (duplicated cost).
- **High-frequency health checks** (an App Service/Kubernetes probe): already filtered by
  `IgnoredPaths`; add the project's real routes to that list.
- **CORS with an explicit header allowlist**: add `traceparent` and `tracestate` to
  `WithHeaders(...)`, and `X-Trace-Id` to `WithExposedHeaders(...)`. Without the expose, the frontend
  can't read the header.
- **A gateway (YARP/Ocelot) in front**: it's a service too (`<base>-gateway`) and needs to propagate
  `traceparent` (YARP does this by default).
