# Queues, workers, jobs, and Azure Functions

Goal: the message published during a request carries the trace context, and the consumer opens a
**child** span of it. Result: a single Trace ID from the click on the frontend through to the
asynchronous processing.

## 1. Service rule

- A separate process (a Worker Service, a Function App, a standalone console app) is its **own
  service**, with its own `ObservabilityConfiguration` (no `[WEB]` blocks) and its own `service.name`.
- A `BackgroundService`/`IHostedService` **inside** the API is the same service as the API — it just
  needs manual spans per unit of work (`ObservabilityConfiguration.ActivitySource.StartActivity(...)`).
- A background loop with no span per item produces either one endless trace or no trace at all —
  always open one span per message/item processed.

## 2. By technology

| Technology | Path | Notes |
|---|---|---|
| **Azure Service Bus** (`Azure.Messaging.ServiceBus`) | Native: `AppContext.SetSwitch("Azure.Experimental.EnableActivitySource", true);` at the start of `Program` + `tracing.AddSource("Azure.Messaging.ServiceBus.*")` | The SDK propagates context through the message's application properties. Apply on the publisher **and** the consumer. Confirm the switch's exact name for the installed SDK version. |
| **RabbitMQ.Client 7.x** | Native: the client's own OpenTelemetry integration package, or `AddSource` on the client's own ActivitySources | Check the package/source name for the installed version. |
| **RabbitMQ.Client 6.x** | Manual: `MessagingTracePropagation` with `BasicProperties.Headers` | Headers arrive as `byte[]` — the helper already handles that. |
| **MassTransit 8** | Native: `tracing.AddSource("MassTransit")` | Automatic propagation between publish and consume. |
| **Hangfire** | `OpenTelemetry.Instrumentation.Hangfire` → `AddHangfireInstrumentation()` | Creates one span per job execution. To link it back to the request that enqueued it, check the installed version's propagation support; if there's none, write `traceparent` via a job filter and extract it with the helper. |
| **Quartz.NET** | Quartz's own ActivitySource (recent versions) or a manual span per job | A scheduled job has no originating request — the trace legitimately starts at the job. |
| **Confluent.Kafka** | Manual: `MessagingTracePropagation` with `Message.Headers` (converted to `IDictionary`) | No stable official instrumentation. |
| **Azure Storage Queues** / a SQL-table queue | Manual: write `traceparent` alongside the message (a metadata field/column) and extract it in the consumer | For a SQL table, a `TraceParent varchar(55)` column is enough. |
| **Azure Functions (isolated)** | `Microsoft.Azure.Functions.Worker.OpenTelemetry` + `UseFunctionsWorkerDefaults()` and `"telemetryMode": "OpenTelemetry"` in `host.json` | Check the current docs — support has evolved across versions. In-process model: report it as a limitation and recommend migrating to isolated. |
| **Any other language's queue/worker** | See `references/other-stacks.md` | Same principle: a Producer span on publish injecting `traceparent`, a Consumer span on receive extracting it. |

## 3. Using the manual helper

```csharp
// Producer side (inside the HTTP request — inherits the frontend's Trace ID)
var headers = new Dictionary<string, object?>();
using (MessagingTracePropagation.StartProducerActivity("orders", headers, system: "rabbitmq"))
{
    props.Headers = headers!;
    channel.BasicPublish(exchange, routingKey, props, body);
}

// Consumer side (a worker)
using var activity = MessagingTracePropagation.StartConsumerActivity("orders", headersReadOnly, system: "rabbitmq");
try { await ProcessAsync(message, ct); }
catch (Exception ex) { activity.MarkFailed(ex); logger.LogError(ex, "Failed to process order"); throw; }
```

## 4. Workers and the error contract

A worker doesn't answer a user, so there's no error screen. What keeps it traceable:
- An error log with the exception inside the consumer's span (the log inherits the `TraceId`).
- A message sent to a retry queue/DLQ keeps its original headers — the Trace ID still points back to
  the originating request.
- If the processing result comes back to the user (an order's status, a notification), store the
  Trace ID next to the failure record so the status screen can show it.
