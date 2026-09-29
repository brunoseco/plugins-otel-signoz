// otel-signoz plugin template. Placeholder: __NAMESPACE__. Requires ASP.NET Core (.NET 7+ for ProblemDetailsOptions).
using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Trace;

namespace __NAMESPACE__.Observability;

public static class TraceIdResponseExtensions
{
    public const string HeaderName = "X-Trace-Id";
    public const string FieldName = "traceId"; // if the project already uses correlationId/requestId, follow the interview's decision

    /// <summary>W3C Trace ID (32 hex chars) for the current request. Falls back to ASP.NET Core's TraceIdentifier.</summary>
    public static string GetTraceId(this HttpContext context) =>
        Activity.Current?.TraceId.ToHexString() ?? context.TraceIdentifier;

    /// <summary>
    /// Adds X-Trace-Id to EVERY response — covers custom controller returns, downloads (blob streams),
    /// and infrastructure errors without touching each call site. Register it right after UseRouting/before
    /// the endpoints (or at the very top of the pipeline). Remember to expose the header in CORS:
    /// WithExposedHeaders("X-Trace-Id").
    /// </summary>
    public static IApplicationBuilder UseTraceIdHeader(this IApplicationBuilder app) =>
        app.Use((context, next) =>
        {
            context.Response.OnStarting(static state =>
            {
                var ctx = (HttpContext)state;
                ctx.Response.Headers[HeaderName] = ctx.GetTraceId();
                return Task.CompletedTask;
            }, context);
            return next(context);
        });

    /// <summary>
    /// Guarantees a traceId (32 hex chars, same format as the header) on every ProblemDetails — including
    /// [ApiController]'s automatic 400, which by default uses ASP.NET Core's long W3C format
    /// "00-traceid-spanid-01".
    /// Composes with any existing CustomizeProblemDetails in the project (doesn't overwrite it).
    /// Doesn't call AddProblemDetails(): if the project wants ProblemDetails for exceptions, it registers
    /// that itself.
    /// </summary>
    public static IServiceCollection AddTraceIdToProblemDetails(this IServiceCollection services)
    {
        services.PostConfigure<ProblemDetailsOptions>(options =>
        {
            var previous = options.CustomizeProblemDetails;
            options.CustomizeProblemDetails = ctx =>
            {
                previous?.Invoke(ctx);
                ctx.ProblemDetails.Extensions[FieldName] = ctx.HttpContext.GetTraceId();
            };
        });
        return services;
    }

    /// <summary>
    /// For custom handlers/middleware/filters: marks the span as an error, records the exception, and
    /// returns the Trace ID to include in the response body (a custom envelope or ProblemDetails).
    /// </summary>
    public static string MarkErrorAndGetTraceId(this HttpContext context, Exception exception)
    {
        var activity = Activity.Current;
        if (activity is not null)
        {
            activity.SetStatus(ActivityStatusCode.Error, exception.GetType().Name);
            // Activity.AddException comes from System.Diagnostics.DiagnosticSource 9+ (a transitive
            // dependency of the current OpenTelemetry packages, including on net8). Older OpenTelemetry
            // packages: use activity.RecordException(exception) instead.
            activity.AddException(exception);
        }
        return context.GetTraceId();
    }
}
