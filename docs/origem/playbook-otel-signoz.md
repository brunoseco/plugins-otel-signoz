# Playbook — OpenTelemetry + SigNoz (API .NET + Front Angular, com Auth)

> Runbook genérico pra implantar ou revisar observabilidade (traces + logs + métricas) num projeto
> típico da Target: backend .NET (API) + frontend Angular, geralmente com autenticação (JWT/OIDC/SSO)
> na frente. Não é documentação de um projeto específico — é pra ler, adaptar às versões detectadas
> no repo em questão, e aplicar. Escrito a partir da implementação real no Target Intranet v2
> (.NET 10 + Angular 20 + SigNoz Cloud), mas os passos abaixo cobrem faixas de versão mais amplas.

## Passo 0 — Descobrir o stack do projeto antes de tocar em qualquer código

Nunca assuma versão. Rode:

```bash
# .NET — versão alvo de cada projeto
grep -r "<TargetFramework>" **/*.csproj

# Angular — versão do core
grep '"@angular/core"' package.json

# Já existe alguma instrumentação/observabilidade no projeto?
grep -ril "opentelemetry\|application insights\|datadog\|newrelic\|elastic apm" --include="*.cs" --include="*.ts" --include="*.json" .

# Estilo de bootstrap do backend (top-level statements ou Startup.cs)
grep -l "WebApplication.CreateBuilder" **/Program.cs
grep -l "public class Startup" **/Startup.cs 2>/dev/null

# Autenticação existente no backend (pra saber que claim usar como enduser.id)
grep -rn "AddAuthentication\|AddJwtBearer\|AddOpenIdConnect\|AddCookie" --include="*.cs" .

# Interceptor HTTP existente no frontend (funcional ou class-based) e lib de toast/notificação
grep -rln "HttpInterceptorFn\|HTTP_INTERCEPTORS" --include="*.ts" src
grep -rln "sweetalert2\|ngx-toastr\|MatSnackBar\|primeng/toast" package.json
```

Se já existir uma stack de observabilidade (Application Insights, Datadog, etc.), **não implante uma
segunda em paralelo** — revise a existente contra as seções 3/5 abaixo e pare por aí. Duas
telemetrias exportando pro mesmo tipo de dado é desperdício de custo e ruído.

### 0.1 Já existe alguma coisa? Guia de adaptação (herdar, não substituir)

O objetivo final é sempre o mesmo — trace correlacionado front↔back(↔auth) + Trace ID na tela de erro
(seção 3.5/3.6) — não necessariamente trocar a stack já em uso. Adapte conforme o que já existir:

| Situação encontrada no repo | O que fazer |
|---|---|
| Já tem OpenTelemetry configurado, exportando pra outro backend (Jaeger, Tempo, Application Insights, Datadog, Elastic APM) | **Não troque de exportador sem necessidade.** Só adicione o que provavelmente falta: 2.5 (Trace ID em toda resposta de erro) e 3.5/3.6 (exibição condicionada no front, seção 6.1). Confira se o campo já tem outro nome convencionado no projeto (`correlationId`, `requestId`) antes de introduzir `traceId` como um segundo nome pra mesma coisa. |
| Já tem Application Insights (SDK clássico `Microsoft.ApplicationInsights`, não OTEL) | O App Insights moderno já suporta OTEL nativo (`Azure.Monitor.OpenTelemetry.AspNetCore`) — migre pro pipeline da seção 2 só se o projeto for adotar um backend OTLP (SigNoz ou outro); por baixo o SDK clássico também usa `System.Diagnostics.Activity`, então a seção 2.5 (`Activity.Current?.TraceId`) funciona igual sem migrar nada. |
| Já tem logging estruturado (Serilog/NLog/Winston) sem tracing distribuído | Logging estruturado **não substitui** tracing distribuído — são coisas diferentes e podem coexistir. Mantenha o sink de log atual e some a seção 2 por cima; para os dois ficarem pesquisáveis juntos, enriqueça o logger existente com `TraceId`/`SpanId` de `Activity.Current` (`Enrich.FromLogContext` no Serilog, por exemplo). |
| Já tem *algum* handler global de erro/exception filter, mas sem Trace ID na resposta | É o caso mais comum. Não reescreva o handler — só acrescente o campo (seção 2.5), preservando toda a lógica de mapeamento de exceção→status já existente. |
| Não tem nada disso | Aplique as seções 2/3 do zero. |

Regra geral: o valor real desta instrução não é "ter OpenTelemetry" — é o par **Trace ID sempre na
resposta de erro (2.5) + Trace ID visível pro usuário só quando for erro de fato (3.5)**. Se o
projeto já tem telemetria mas não tem esse par, é isso que faltou implementar, não a stack inteira.

---

## 1. Arquitetura-alvo (o que você está construindo)

```
Navegador (Angular)                       API (.NET)
┌───────────────────────┐                 ┌───────────────────────────┐
│ TelemetryService        │               │ ObservabilityConfiguration │
│  WebTracerProvider       │               │  (AspNetCore/HttpClient/   │
│  (fetch/xhr/click/load)  │  traceparent  │   SqlClient/EFCore)        │
│  → OTLP/HTTP ───────────┼──────────────►│  → OTLP/HTTP               │
└────────────┬─────────────┘  (mesmo      └──────────────┬─────────────┘
             │                 trace id)                   │
             ▼                                              ▼
                    Coletor OTLP (SigNoz Cloud ou self-hosted)
                                    │
                                    ▼
                          Dashboard SigNoz + MCP do SigNoz
```

**Peça-chave da arquitetura:** o front injeta o header `traceparent` (padrão W3C Trace Context) em
toda chamada pra API própria; a instrumentação ASP.NET Core do backend lê esse header e **continua o
mesmo trace** em vez de abrir um novo. Isso é o que permite, mais tarde, que um erro visto no
navegador e a exceção que o causou no backend apareçam **correlacionados pelo mesmo trace ID** — e é
esse trace ID que deve voltar pro usuário na tela de erro, quando for um erro de fato (seção 3.5/3.6).

**Se a autenticação for um terceiro processo** (Identity Server/Duende/OpenIddict/Keycloak/Auth0/
Okta, em vez de um middleware validando token inline dentro da própria API) — comum o bastante pra
merecer tratamento à parte — trate-o como uma terceira caixa no diagrama acima, instrumentada do mesmo
jeito que a API (seção 2); a correlação de trace com esse terceiro processo depende de *como* ele é
chamado (redirect de browser vs. chamada HTTP instrumentada) — ver seção 2.6.

---

## 2. Backend (.NET) — instrumentação

### 2.1 Compatibilidade por versão do .NET

| .NET | Observação |
|---|---|
| **6, 7, 8, 9, 10** | `WebApplication`/minimal hosting (`Program.cs` top-level) — todos os passos abaixo se aplicam sem alteração. |
| **Framework 4.x / .NET Core 3.1 / .NET 5 (fora de suporte, mas ainda existe por aí)** | Sem `WebApplicationBuilder`. Adapte a extensão pra receber `IServiceCollection services` + `IConfiguration configuration` e chamar a partir de `Startup.ConfigureServices`; o restante (pacotes, `AddOpenTelemetry()`, exporters) é idêntico. |
| Todas as versões | O pacote `OpenTelemetry.Instrumentation.SqlClient` **costuma só ter versão prerelease** no NuGet (`dotnet add package OpenTelemetry.Instrumentation.SqlClient --prerelease`) — isso é do pacote, não da versão do .NET; confira o estado atual antes de assumir que virou estável. Se o projeto usa **EF Core** com outro provider (Npgsql/MySql), troque `AddSqlClientInstrumentation` pelo pacote de instrumentação do provider certo (`OpenTelemetry.Instrumentation.EntityFrameworkCore` cobre EF Core de forma agnóstica a provider, é geralmente a opção mais simples). |

### 2.2 Pacotes NuGet

```bash
cd <pasta do projeto de API>
dotnet add package OpenTelemetry.Extensions.Hosting
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
dotnet add package OpenTelemetry.Instrumentation.AspNetCore
dotnet add package OpenTelemetry.Instrumentation.Http
dotnet add package OpenTelemetry.Instrumentation.Runtime
dotnet add package OpenTelemetry.Instrumentation.SqlClient --prerelease   # ou EntityFrameworkCore, ver 2.1
dotnet build   # confirma que restaurou/compilou antes de seguir
```

### 2.3 Configuração (`appsettings.json`)

```json
"Observability": {
  "Endpoint": "https://ingest.<região>.signoz.cloud:443",
  "IngestionKey": "<ingestion key da conta SigNoz deste projeto/cliente>",
  "ServiceName": "<nome-do-servico-api>"
}
```

> **Se o projeto tiver política de segredos mais rígida que "credencial estática em appsettings"**
> (Key Vault, variável de ambiente injetada pelo pipeline, etc.) — siga o padrão **já em uso nesse
> projeto**, não introduza uma exceção nova só pra observabilidade. Se o projeto ainda não tem
> nenhum padrão de segredo definido, prefira variável de ambiente/Key Vault em vez de commitar a
> chave — isso é uma decisão nova, não repita cegamente o exemplo de um projeto legado que já
> commitava outros segredos.

### 2.4 Extension method de configuração

Isolar num arquivo próprio (`Observability/ObservabilityConfiguration.cs` ou equivalente), nunca
inline no `Program.cs`:

```csharp
using OpenTelemetry.Exporter;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace <Namespace>.Observability;

public static class ObservabilityConfiguration
{
    public static WebApplicationBuilder AddObservability(this WebApplicationBuilder builder)
    {
        var config = builder.Configuration;
        var endpoint = config["Observability:Endpoint"]!.TrimEnd('/');
        var ingestionKey = config["Observability:IngestionKey"];
        var serviceName = config["Observability:ServiceName"] ?? "<nome-default>";
        if (builder.Environment.IsDevelopment())
            serviceName += "-dev";

        var headers = $"signoz-ingestion-key={ingestionKey}"; // trocar o nome do header se o backend de observabilidade não for SigNoz
        var environmentName = builder.Environment.EnvironmentName;

        void ConfigureResource(ResourceBuilder resource) => resource
            .AddService(serviceName)
            .AddAttributes(new Dictionary<string, object> { ["deployment.environment"] = environmentName });

        builder.Services.AddOpenTelemetry()
            .ConfigureResource(ConfigureResource)
            .WithTracing(tracing => tracing
                .AddAspNetCoreInstrumentation(o =>
                {
                    // Se o projeto tem autenticação: enriquece o span com o usuário autenticado.
                    // Use um ID interno/claim estável (sub, oid, GUID de usuário) — NUNCA e-mail/CPF/
                    // nome cru em texto plano num span exportado pra terceiro (LGPD).
                    o.EnrichWithHttpRequest = (activity, request) =>
                    {
                        var userId = request.HttpContext.User?.FindFirst("sub")?.Value
                                     ?? request.HttpContext.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                        if (!string.IsNullOrEmpty(userId))
                            activity.SetTag("enduser.id", userId);
                    };
                })
                .AddHttpClientInstrumentation()
                .AddSqlClientInstrumentation() // ou .AddEntityFrameworkCoreInstrumentation()
                .AddOtlpExporter(o =>
                {
                    o.Endpoint = new Uri($"{endpoint}/v1/traces");
                    o.Protocol = OtlpExportProtocol.HttpProtobuf;
                    o.Headers = headers;
                }))
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation()
                .AddOtlpExporter(o =>
                {
                    o.Endpoint = new Uri($"{endpoint}/v1/metrics");
                    o.Protocol = OtlpExportProtocol.HttpProtobuf;
                    o.Headers = headers;
                }));

        var loggingResource = ResourceBuilder.CreateDefault();
        ConfigureResource(loggingResource);

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.SetResourceBuilder(loggingResource);
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
            logging.AddOtlpExporter(o =>
            {
                o.Endpoint = new Uri($"{endpoint}/v1/logs");
                o.Protocol = OtlpExportProtocol.HttpProtobuf;
                o.Headers = headers;
            });
        });

        // Evita loop de auto-observação: sem isso, o HttpClient dos próprios exporters OTLP gera
        // logs Information que voltam a ser exportados pelo pipeline que acabou de criá-los.
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpTraceExporter", LogLevel.None);
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpMetricExporter", LogLevel.None);
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpLogExporter", LogLevel.None);

        return builder;
    }
}
```

Registrar em `Program.cs`, **depois de `AddAuthentication`/`AddAuthorization` e antes de `builder.Build()`**:

```csharp
builder.AddObservability();
var app = builder.Build();
```

### 2.5 Middleware/handler global de erro → sempre devolver um Trace ID

Independente da taxonomia de exceções do projeto (a maioria dos backends .NET tem algo do tipo
`NotFoundException`/`BusinessException`/`ForbiddenException` mapeado num middleware ou filtro
global), o ponto que costuma faltar é: **a resposta de erro não inclui como o usuário/suporte pode
localizar o log correspondente**. Ajuste o handler global de exceção pra sempre incluir o trace ID
atual, mesmo quando a mensagem em si é genérica por segurança:

```csharp
using System.Diagnostics;

// dentro do catch/handler de exceção global do projeto:
var traceId = Activity.Current?.TraceId.ToString();
// ... serializar a resposta de erro incluindo `traceId` (nome do campo livre, mas documente/padronize)
```

**Não** use isso como desculpa pra vazar a mensagem real da exceção pro cliente — o Trace ID é
suficiente pra quem tem acesso ao backend de observabilidade investigar; a mensagem pro usuário final
continua seguindo a política de segurança já em uso no projeto (genérica pra erros não mapeados,
específica só pras exceções de negócio que já eram seguras de expor).

### 2.6 Quando a autenticação é um processo separado (Identity Server / Duende / OpenIddict / Keycloak / Auth0 / Okta)

Em vários projetos "auth" não é um middleware validando token inline dentro do próprio processo da
API (caso mais simples — trate como parte normal da seção 2, sem nada especial). É um **serviço HTTP
dedicado**, com deploy e ciclo de vida próprios: Duende IdentityServer/IdentityServer4, um
Authorization Server OpenIddict standalone, Keycloak, Auth0, Okta, Azure AD B2C custom policies, etc.
Nesse caso "auth" é um **terceiro processo instrumentável**, não um passo dentro do backend.

**Regra:** aplique a seção 2 (pacotes + `AddObservability`/equivalente) **também** nesse processo, se
o código for seu (.NET, Node, Java — o princípio OTLP é o mesmo, só troca o pacote de instrumentação
pelo do stack). Se for produto de terceiro fechado:

- **Keycloak self-hosted** tem exporter OTEL nativo a partir de certas versões — confirme a versão
  antes de assumir que existe (`KC_TRACING_ENABLED` e variáveis relacionadas).
- **Auth0/Okta (SaaS)** não expõe OTEL — a correlação fica limitada aos logs/eventos que o próprio
  produto expõe (Auth0 Log Streams, Okta System Log). Trate isso como **fonte de dado separada**, não
  como trace correlacionado, e documente a limitação em vez de tentar forçar uma correlação que não
  existe.

**Onde a correlação de trace realmente funciona** (não assuma que "front→auth→back" sempre propaga o
mesmo trace id — depende do mecanismo de transporte):

| Fluxo | O trace do front continua até o Auth Server? |
|---|---|
| SPA redireciona o browser inteiro pra `/authorize` (Authorization Code flow, com ou sem PKCE) | **Não.** É navegação de página inteira, não uma chamada `fetch`/`XHR` instrumentada — o header `traceparent` não viaja nesse redirect. O Auth Server abre um trace próprio pra essa requisição, sem link automático com o que originou o clique em "Entrar". |
| SPA troca `code` por token via `POST /connect/token` / `/oauth/token` (chamada `fetch`/`XHR`, não redirect) | **Sim**, desde que o domínio do Auth Server esteja incluído no `propagateTraceHeaderCorsUrls` (seção 3.4) e o CORS dele permita o header `traceparent`. |
| Backend (API) chama o Auth Server via `HttpClient` (introspection, JWKS, refresh token, client credentials) | **Sim, automaticamente** — já coberto por `AddHttpClientInstrumentation()` da seção 2, desde que o Auth Server também esteja instrumentado (senão o span "morre" sem correlação do lado de lá). |
| Validação de token é **local** (biblioteca valida assinatura/expiração sem round-trip ao Auth Server — ex. `UseLocalServer` do OpenIddict.Validation, JWT bearer clássico com chave pública em cache) | Não há chamada de rede nessa validação — nada a correlacionar, é instantâneo dentro do próprio processo da API. |

**Conclusão prática:** não force correlação onde ela estruturalmente não existe — o redirect de login
é o "buraco" mais comum. Pra investigar problema de login, busque no serviço do Auth Server por
atributo (e-mail/username tentado, `client_id`, janela de tempo aproximada), não por um trace ID
herdado da SPA que nunca chegou lá. Pra investigar um erro que ocorre **depois** do login (já
autenticado, usando a API normalmente), a correlação volta a valer normalmente pelas seções 2/3.

Um caso particular que vale citar: um serviço pode ser **backend de dados e Authorization Server ao
mesmo tempo, no mesmo processo** (ex.: um serviço que expõe `/connect/authorize`+`/connect/token`
próprios via OpenIddict e delega só o login federado do usuário final a um provedor externo via
redirect). Trate esse processo como qualquer outro backend da seção 2 — ele só desempenha dois papéis,
a instrumentação continua sendo "um processo, uma seção 2"; a limitação de redirect acima ainda se
aplica à etapa de login federado especificamente.

---

## 3. Frontend (Angular) — instrumentação

### 3.1 Compatibilidade por versão do Angular

| Angular | O que muda no exemplo abaixo |
|---|---|
| **< 14** | Sem standalone components. Registre o `TelemetryService` e o inicializador num `NgModule` (`AppModule`), token `APP_INITIALIZER` clássico nos `providers` do módulo. |
| **14–18** | Standalone components disponíveis. `APP_INITIALIZER` como objeto (`{provide: APP_INITIALIZER, useFactory, deps, multi: true}`) em `app.config.ts`. |
| **19+** | Prefira `provideAppInitializer(fn)` (API funcional) no lugar do token `APP_INITIALIZER` — mais simples, sem `useFactory`/`deps`/`multi` manual: `provideAppInitializer(() => inject(TelemetryService).initialize())`. |
| **Interceptors** | Angular 15+ suporta interceptors funcionais (`HttpInterceptorFn` + `withInterceptors([...])` em `provideHttpClient`) — é o padrão do exemplo abaixo. Em projetos mais antigos (class-based `HttpInterceptor` + `HTTP_INTERCEPTORS` multi-provider), adapte a lógica pro método `intercept()`. |
| **Zoneless** (`provideZonelessChangeDetection`, opção estável a partir do Angular ~18/19 conforme o projeto) | `ZoneContextManager` do OpenTelemetry depende de `zone.js`. Em app zoneless, troque por `new StackContextManager()` (do próprio `@opentelemetry/sdk-trace-web`) — a propagação de contexto em código assíncrono fica um pouco menos precisa, mas funciona sem zone.js. |

### 3.2 Pacotes npm

```bash
cd <pasta do frontend>
npm install @opentelemetry/api @opentelemetry/context-zone @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/instrumentation @opentelemetry/instrumentation-document-load \
  @opentelemetry/instrumentation-fetch @opentelemetry/instrumentation-user-interaction \
  @opentelemetry/instrumentation-xml-http-request @opentelemetry/resources \
  @opentelemetry/sdk-trace-base @opentelemetry/sdk-trace-web
# Se o app for zoneless, troque @opentelemetry/context-zone por nada extra —
# StackContextManager já vem em @opentelemetry/sdk-trace-web.
```

### 3.3 Configuração de ambiente

```ts
// environment.ts / environment.prod.ts / etc — um bloco por ambiente, serviceName distinto
signoz: {
  endpoint: 'https://ingest.<região>.signoz.cloud:443',
  ingestionKey: '<ingestion key>',
  serviceName: '<nome-do-servico>-ui[-dev|-homolog]',
}
```

Chave de **ingestão** de frontend embutida no bundle JS é o padrão oficial do SigNoz (e da maioria
dos backends OTLP) pra browser — não é uma credencial de leitura/administração, só grava. Ainda
assim, confirme isso contra a política de segurança do projeto/cliente antes de assumir que está ok.

### 3.4 `TelemetryService`

```ts
import { Injectable } from '@angular/core';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { ZoneContextManager } from '@opentelemetry/context-zone-peer-dep'; // trocar por StackContextManager se zoneless
import { resourceFromAttributes } from '@opentelemetry/resources';
import { environment } from '../../environments/environment';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private isInitialized = false;

  initialize(): void {
    if (this.isInitialized || !environment.signoz?.ingestionKey) return;

    try {
      const headers = { 'signoz-ingestion-key': environment.signoz.ingestionKey };
      const resource = resourceFromAttributes({ 'service.name': environment.signoz.serviceName });

      const exporter = new OTLPTraceExporter({ url: `${environment.signoz.endpoint}/v1/traces`, headers });
      const provider = new WebTracerProvider({ resource, spanProcessors: [new BatchSpanProcessor(exporter)] });
      provider.register({ contextManager: new ZoneContextManager() });

      // Restringe a propagação do header traceparent só pra API própria — nunca deixe vazar
      // esse header pra domínios de terceiros (Graph, gateways de pagamento, etc.).
      const apiUrlPattern = new RegExp(`^${escapeRegExp(environment.apiUrl)}`);

      registerInstrumentations({
        instrumentations: [
          new DocumentLoadInstrumentation(),
          new UserInteractionInstrumentation(),
          new FetchInstrumentation({ propagateTraceHeaderCorsUrls: [apiUrlPattern] }),
          new XMLHttpRequestInstrumentation({ propagateTraceHeaderCorsUrls: [apiUrlPattern] }),
        ],
      });

      this.isInitialized = true;
    } catch (error) {
      console.warn('Erro ao inicializar telemetria:', error);
    }
  }
}
```

Registro em `app.config.ts` (Angular 19+):

```ts
providers: [
  // ...
  provideAppInitializer(() => inject(TelemetryService).initialize()),
]
```

Angular 14–18 (token clássico):

```ts
{
  provide: APP_INITIALIZER,
  useFactory: (telemetry: TelemetryService) => () => telemetry.initialize(),
  deps: [TelemetryService],
  multi: true,
}
```

### 3.5 Interceptor de erro HTTP → mostrar Trace ID pro usuário só quando for erro de fato

O objetivo: **toda** mensagem de erro que for uma falha real do sistema — não uma resposta esperada
do domínio — deve trazer o Trace ID junto, com um jeito fácil de copiar e enviar pro suporte, sem
precisar vazar detalhe técnico da exceção.

**Critério — o corte é por status HTTP, decidido inteiramente no frontend:**

| Mostrar Trace ID + bloco de suporte (é falha do sistema) | Não mostrar (é resposta esperada do domínio) |
|---|---|
| `>= 500` — exceção não mapeada/infraestrutura | `400`/`422` — validação/regra de negócio (`BusinessException` ou equivalente); o usuário já tem o que precisa pra corrigir sozinho |
| `0`/timeout — servidor inalcançável, rede caiu (sem Trace ID nesse caso — a requisição nem chegou a gerar um; oferecer só o canal de suporte) | `401` — sessão expirada, já tratado por redirect de login |
| | `403` — acesso negado, autorização funcionando como esperado |
| | `404` — recurso não encontrado |
| | `429` — rate limit |

Importante: o backend **continua** incluindo `traceId` em toda resposta de erro, sem exceção (seção
2.5) — isso não muda. O corte acima é só sobre o que o **frontend exibe** pro usuário; manter o dado
sempre disponível no payload evita ter que tocar no backend de novo se o critério de exibição mudar.

```ts
const STATUS_SEM_TRACE_ID_VISIVEL = new Set([400, 401, 403, 404, 422, 429]);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notify = inject(YourNotificationService); // toast/snackbar/o que o projeto já usa

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const message = error.error?.mensagem ?? error.error?.message ?? 'Erro ao processar requisição.';

      // Erro "de fato" (falha do sistema) = status >= 500 ou requisição que nem chegou ao servidor.
      // Nesses casos, e só nesses, mostra o Trace ID + caminho de suporte (ver 3.6).
      const ehErroDeFato = error.status === 0 || error.status >= 500 || !STATUS_SEM_TRACE_ID_VISIVEL.has(error.status);
      const traceId: string | undefined = ehErroDeFato ? error.error?.traceId : undefined; // mesmo campo emitido no passo 2.5

      notify.showError(message, traceId); // ver 3.6 — bloco de copiar + contato de suporte só quando traceId vier preenchido
      return throwError(() => error);
    })
  );
};
```

### 3.6 Componente/serviço de notificação de erro — padrão mínimo

Independente da lib de UI (SweetAlert2, `ngx-toastr`, Angular Material `MatSnackBar`, componente
próprio), a mensagem de erro exibida deve ter:

1. **A mensagem** (já existia antes, não mude a política de mascaramento do projeto).
2. **O Trace ID**, se veio na resposta.
3. **Um botão "Copiar"** que copia mensagem + Trace ID pra área de transferência (`navigator.clipboard.writeText`).
4. **Um caminho claro de contato com o suporte** — link `mailto:` com assunto/corpo pré-preenchidos
   (incluindo instrução pra anexar print de tela) é o mínimo; se o projeto tiver um sistema de
   chamados (Jira Service Desk, Zendesk, etc.), prefira linkar direto pra abrir um chamado já
   preenchido, se a ferramenta suportar deep link.

```ts
const mailBody = encodeURIComponent(`${message}${traceId ? `\nTrace ID: ${traceId}` : ''}\n\n(Anexe um print desta tela)`);
const mailtoHref = `mailto:<email-do-suporte>?subject=${encodeURIComponent('Erro na aplicação')}&body=${mailBody}`;
```

---

## 4. Checklist — revisando um projeto que já tem (ou deveria ter) observabilidade

- [ ] Toda chamada HTTP de saída usa `HttpClient` via `IHttpClientFactory`/injeção — `new HttpClient()` direto não é capturado pela instrumentação.
- [ ] Nenhum `catch { }` vazio sem log — sem log, não vira span/log correlacionado.
- [ ] O handler global de exceção devolve `traceId` em **toda** resposta de erro (não só 5xx) — é isso que fecha o ciclo usuário→suporte→trace.
- [ ] O front só **exibe** o Trace ID pro usuário quando for erro de fato (status `>= 500` ou falha de rede) — não em validação/negócio (400/422), sessão expirada (401), acesso negado (403), não encontrado (404) ou rate limit (429); ver seção 3.5.
- [ ] A mensagem de erro pro usuário final não descreve estrutura interna (nome de tabela/coluna/stored procedure, stack trace) — isso é para o log/trace, não pra resposta HTTP.
- [ ] Se existe um Auth Server como processo separado do backend principal (Identity Server/OpenIddict/Keycloak/Auth0/Okta), ele tem sua **própria** config de observabilidade (seção 2) — não herda automaticamente por estar "perto" da API na arquitetura; ver seção 2.6 pra onde a correlação de trace realmente funciona (e onde não funciona, por design).
- [ ] `propagateTraceHeaderCorsUrls`/config equivalente restringe a propagação do header de trace só pra API própria, nunca pra domínios de terceiros.
- [ ] Se o projeto tem autenticação, o span HTTP é enriquecido com um identificador estável do usuário (claim `sub`/ID interno) — nunca e-mail/CPF/nome em texto plano num atributo de span exportado.
- [ ] Se existir processamento assíncrono (fila, job em background, worker separado — Hangfire, Azure Functions, etc.), confirme se ele roda no mesmo processo instrumentado ou é um processo separado; processo separado = precisa da própria configuração de observabilidade, não herda a da API automaticamente.
- [ ] Sem dashboards/alertas configurados ainda? Registre isso como dívida — instrumentação sem alerta é só "investigação reativa depois que o usuário reclamou", não é proatividade.

---

## 5. Investigando um problema com o MCP do SigNoz

### 5.1 Setup (uma vez por máquina/usuário, por conta SigNoz)

```bash
claude mcp add --scope user --transport http signoz https://mcp.us.signoz.cloud/mcp
```

No primeiro uso, o cliente pede:

- **SigNoz Instance URL** — a URL da conta SigNoz **deste** projeto/cliente (ex.: `https://<empresa>.us.signoz.cloud`). Cada cliente/projeto pode ter conta própria — não assuma que é a mesma de outro projeto que você já configurou antes.
- **Key** — API key de leitura da conta (diferente da ingestion key usada no `appsettings`/`environment.ts`, que só grava).

Depois de autorizar, os tools do MCP só aparecem em sessões **novas** do Claude Code — se acabou de autorizar, abra uma conversa nova.

### 5.2 Fluxo de investigação

1. **Tem Trace ID?** (veio do toast de erro, de um chamado de suporte, de um log do host) → peça pra buscar esse trace específico — traz a árvore completa de spans (request recebido → chamadas de saída/queries → onde exatamente falhou), sem precisar abrir dashboard manualmente.
2. **Não tem Trace ID, só sintoma** ("a tela X deu erro hoje de manhã") → filtrar logs do serviço por severidade `ERROR` na janela de tempo aproximada, cruzar com atributos de `http.url`/`http.status_code` (já presentes se a seção 2.5/3.5 foi seguida), pegar o `traceId` do log encontrado e ir pro passo 1.
3. **Suspeita de lentidão** (não é erro) → consultar duração de span por rota/serviço na janela de tempo; separar se o gargalo é banco de dados, chamada HTTP externa, ou processamento próprio.
4. **Correlação front↔back** — se o sintoma começou no navegador, o mesmo trace ID deve ter span de frontend (`fetch`/`xhr`) **e** de backend; peça os dois lados, não só o backend.

### 5.3 Cuidados

- Confirme se a conta SigNoz usada é **dedicada a este projeto** ou compartilhada com outros serviços/clientes da Target antes de rodar buscas amplas — evita misturar dado de clientes diferentes na mesma investigação (viola a restrição de não misturar dados de clientes distintos).
- Processos que não têm a instrumentação da seção 2 (ex.: um serviço satélite separado do monólito principal) simplesmente não aparecem no SigNoz — não é bug do MCP, é ausência de instrumentação nesse processo específico.

---

## 6. Erros comuns ao implantar isso pela primeira vez num projeto novo

- **`OpenTelemetry.Instrumentation.SqlClient` não resolve** → adicionar `--prerelease` no `dotnet add package`.
- **Zone.js warning/conflito no console do navegador** → app provavelmente já usa outra fonte de zone.js (ou é zoneless) — trocar `ZoneContextManager` por `StackContextManager`.
- **Nada aparece no SigNoz depois de configurado** → checar log da própria API por erro do exporter OTLP (categoria `OpenTelemetry` no `ILogger`) — geralmente é chave de ingestão errada, endpoint sem `/v1/traces` etc no sufixo certo, ou rede/firewall bloqueando saída HTTPS pro host de ingestão.
- **Trace do front não conecta com o do back** → normalmente é `propagateTraceHeaderCorsUrls` não bater com a URL real da API (regex errado) ou CORS do backend não permitir o header `traceparent` (adicionar `traceparent`/`tracestate` na lista de headers permitidos do CORS, se o projeto tiver uma allowlist explícita de headers).
