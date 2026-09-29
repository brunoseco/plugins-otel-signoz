// otel-signoz plugin template. Placeholder: __NAMESPACE__.
// Use this ONLY for brokers/jobs without native instrumentation (RabbitMQ.Client 6.x, Kafka, Azure Storage
// Queues, a SQL-table queue, custom jobs). Service Bus, RabbitMQ.Client 7+, MassTransit, and Hangfire have
// a native path instead — see references/messaging-workers.md.
using System.Diagnostics;
using System.Text;
using OpenTelemetry;
using OpenTelemetry.Context.Propagation;

namespace __NAMESPACE__.Observability;

public static class MessagingTracePropagation
{
    private static TextMapPropagator Propagator => Propagators.DefaultTextMapPropagator;

    /// <summary>
    /// Producer side: opens a Producer span and injects traceparent/tracestate into the message headers.
    /// using var activity = MessagingTracePropagation.StartProducerActivity("orders", headers);
    /// </summary>
    public static Activity? StartProducerActivity(string destination, IDictionary<string, object?> headers, string system = "custom")
    {
        var activity = ObservabilityConfiguration.ActivitySource.StartActivity($"send {destination}", ActivityKind.Producer);
        activity?.SetTag("messaging.system", system);
        activity?.SetTag("messaging.destination.name", destination);
        activity?.SetTag("messaging.operation.type", "send");

        var context = activity?.Context ?? Activity.Current?.Context ?? default;
        if (context != default)
            Propagator.Inject(new PropagationContext(context, Baggage.Current), headers,
                static (carrier, key, value) => carrier[key] = value);

        return activity;
    }

    /// <summary>
    /// Consumer side: extracts the context from the message headers and opens a Consumer span as a child of
    /// the producer's — the same Trace ID as the request that originated the message. Wrap the ENTIRE
    /// processing in the using block.
    /// using var activity = MessagingTracePropagation.StartConsumerActivity("orders", message.Headers);
    /// </summary>
    public static Activity? StartConsumerActivity(string destination, IReadOnlyDictionary<string, object?>? headers, string system = "custom")
    {
        var parent = Propagator.Extract(default, headers, static (carrier, key) =>
        {
            if (carrier is null || !carrier.TryGetValue(key, out var value) || value is null)
                return Enumerable.Empty<string>();
            // RabbitMQ delivers headers as byte[].
            return new[] { value is byte[] bytes ? Encoding.UTF8.GetString(bytes) : value.ToString() ?? string.Empty };
        });

        Baggage.Current = parent.Baggage;

        var activity = ObservabilityConfiguration.ActivitySource.StartActivity(
            $"process {destination}", ActivityKind.Consumer, parent.ActivityContext);
        activity?.SetTag("messaging.system", system);
        activity?.SetTag("messaging.destination.name", destination);
        activity?.SetTag("messaging.operation.type", "process");
        return activity;
    }

    /// <summary>Consumer side: marks the span as failed (the message goes to retry/DLQ — the Trace ID still points back to its origin).</summary>
    public static void MarkFailed(this Activity? activity, Exception exception)
    {
        if (activity is null) return;
        activity.SetStatus(ActivityStatusCode.Error, exception.GetType().Name);
        // Activity.AddException comes from System.Diagnostics.DiagnosticSource 9+ (a transitive dependency
        // of the current OpenTelemetry packages, including on net8). Older OpenTelemetry packages:
        // use activity.RecordException(exception) instead.
        activity.AddException(exception);
    }
}
