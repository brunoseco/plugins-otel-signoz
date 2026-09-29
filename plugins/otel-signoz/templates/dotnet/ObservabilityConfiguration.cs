// otel-signoz plugin template. Placeholders: __NAMESPACE__, __SERVICE_NAME__.
// .NET 8+: extends IHostApplicationBuilder (both WebApplicationBuilder and HostApplicationBuilder implement it).
// .NET 6/7: swap IHostApplicationBuilder for WebApplicationBuilder (see references/dotnet-backend.md).
// Worker/Function without ASP.NET Core: remove the blocks marked [WEB] and the AspNetCore instrumentation package.
using System.Diagnostics;
using System.Reflection;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Exporter;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace __NAMESPACE__.Observability;

public sealed class ObservabilityOptions
{
    public const string SectionName = "Observability";

    /// <summary>E.g.: https://ingest.us.signoz.cloud:443 (no /v1/... suffix).</summary>
    public string? Endpoint { get; set; }

    /// <summary>NEVER commit this. Local: dotnet user-secrets. Deploy: Key Vault or an Observability__IngestionKey environment variable.</summary>
    public string? IngestionKey { get; set; }

    /// <summary>Identical across every environment. The environment itself goes in deployment.environment.</summary>
    public string ServiceName { get; set; } = "__SERVICE_NAME__";

    public string? ServiceNamespace { get; set; }

    /// <summary>vYYYYMMDD.HHMM injected by CI/CD. Falls back to the assembly's InformationalVersion.</summary>
    public string? ServiceVersion { get; set; }

    /// <summary>development | homolog | production.</summary>
    public string? Environment { get; set; }

    /// <summary>1.0 = 100%. Below that, some of the Trace IDs shown to users won't have a complete trace.</summary>
    public double SamplingRatio { get; set; } = 1.0;

    /// <summary>Routes excluded from traces (cost/noise).</summary>
    public string[] IgnoredPaths { get; set; } = new[] { "/health", "/healthz", "/ready", "/alive", "/swagger", "/favicon.ico" };
}

public static class ObservabilityConfiguration
{
    /// <summary>ActivitySource/Meter for manual spans and metrics (jobs, queue consumers, critical business rules).</summary>
    public const string SourceName = "__SERVICE_NAME__";
    public static readonly ActivitySource ActivitySource = new(SourceName);

    public static IHostApplicationBuilder AddObservability(
        this IHostApplicationBuilder builder,
        Action<TracerProviderBuilder>? configureTracing = null,
        Action<MeterProviderBuilder>? configureMetrics = null)
    {
        var options = builder.Configuration.GetSection(ObservabilityOptions.SectionName).Get<ObservabilityOptions>()
                      ?? new ObservabilityOptions();

        var environment = NormalizeEnvironment(options.Environment ?? builder.Environment.EnvironmentName);
        var version = options.ServiceVersion ?? ResolveAssemblyVersion();
        var endpoint = options.Endpoint?.TrimEnd('/');
        var exportEnabled = !string.IsNullOrWhiteSpace(endpoint) && !string.IsNullOrWhiteSpace(options.IngestionKey);
        var headers = $"signoz-ingestion-key={options.IngestionKey}"; // different OTLP backend: rename this header

        if (!exportEnabled)
        {
            // Doesn't take the app down: tracing stays active (Trace ID still on responses), it just doesn't export.
            Console.WriteLine($"[Observability] {options.ServiceName}: Endpoint/IngestionKey missing — OTLP export disabled.");
        }

        var otel = builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                .AddService(serviceName: options.ServiceName, serviceNamespace: options.ServiceNamespace, serviceVersion: version)
                .AddAttributes(new KeyValuePair<string, object>[]
                {
                    new("deployment.environment", environment),      // used by SigNoz's environment filters
                    new("deployment.environment.name", environment), // current OpenTelemetry semantic convention
                }));

        otel.WithTracing(tracing =>
        {
            tracing
                .AddSource(SourceName)
                .SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(options.SamplingRatio)))
                // >>> [WEB] API/Auth server only (ASP.NET Core)
                .AddAspNetCoreInstrumentation(o =>
                {
                    o.RecordException = true;
                    o.Filter = ctx => !options.IgnoredPaths.Any(p => ctx.Request.Path.StartsWithSegments(p));
                    // The user only exists AFTER the authentication middleware runs: enrich on the response, not the request.
                    o.EnrichWithHttpResponse = (activity, response) =>
                    {
                        var userId = ResolveUserId(response.HttpContext.User);
                        if (!string.IsNullOrEmpty(userId))
                            activity.SetTag("enduser.id", userId);
                    };
                })
                // <<< [WEB]
                .AddHttpClientInstrumentation(o => o.RecordException = true)
                .AddSqlClientInstrumentation(o => o.RecordException = true); // EF Core with another provider: AddEntityFrameworkCoreInstrumentation()

            configureTracing?.Invoke(tracing);

            if (exportEnabled)
                tracing.AddOtlpExporter(o => ConfigureOtlp(o, endpoint!, "traces", headers));
        });

        otel.WithMetrics(metrics =>
        {
            metrics
                .AddMeter(SourceName)
                .AddAspNetCoreInstrumentation() // [WEB]
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation();

            configureMetrics?.Invoke(metrics);

            if (exportEnabled)
                metrics.AddOtlpExporter(o => ConfigureOtlp(o, endpoint!, "metrics", headers));
        });

        otel.WithLogging(
            logging =>
            {
                if (exportEnabled)
                    logging.AddOtlpExporter(o => ConfigureOtlp(o, endpoint!, "logs", headers));
            },
            o =>
            {
                o.IncludeFormattedMessage = true;
                o.IncludeScopes = true;
            });

        // Avoids a self-observation loop: without this, the exporters' own HttpClient generates logs that
        // would be exported again by the very pipeline that just created them.
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpTraceExporter", LogLevel.None);
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpMetricExporter", LogLevel.None);
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpLogExporter", LogLevel.None);

        return builder;
    }

    /// <summary>Normalizes to development | homolog | production. An unknown value passes through as-is (so it shows up in SigNoz and can be fixed), never guessed.</summary>
    public static string NormalizeEnvironment(string? value)
    {
        var v = (value ?? string.Empty).Trim().ToLowerInvariant();
        return v switch
        {
            "" or "development" or "dev" or "local" => "development",
            "homolog" or "homologacao" or "homologação" or "hml" or "hom" or "staging" or "stage" or "qa" or "uat" => "homolog",
            "production" or "prod" or "prd" or "producao" or "produção" => "production",
            _ => v,
        };
    }

    // Stable, opaque identifier. NEVER an email/national ID/name in plain text (data-privacy requirement,
    // e.g. LGPD/GDPR). Adjust the claim order to the project.
    private static string? ResolveUserId(ClaimsPrincipal? user) =>
        user?.FindFirst("sub")?.Value
        ?? user?.FindFirst("oid")?.Value
        ?? user?.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value
        ?? user?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private static string ResolveAssemblyVersion()
    {
        var informational = Assembly.GetEntryAssembly()?
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        return string.IsNullOrWhiteSpace(informational) ? "unknown" : informational.Split('+')[0];
    }

    private static void ConfigureOtlp(OtlpExporterOptions o, string endpoint, string signal, string headers)
    {
        o.Endpoint = new Uri($"{endpoint}/v1/{signal}");
        o.Protocol = OtlpExportProtocol.HttpProtobuf;
        o.Headers = headers;
    }
}
