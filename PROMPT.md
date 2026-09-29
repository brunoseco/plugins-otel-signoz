# PROMPT — Construir o plugin `otel-signoz` (Claude Code) do zero

> **Como usar (para você, Bruno — não faz parte do prompt)**
> 1. Crie o repo **privado** vazio no GitHub, clone e entre na pasta.
> 2. Salve o playbook original em `docs/origem/playbook-otel-signoz.md` e este arquivo em `PROMPT.md`.
> 3. Rode `claude`, entre em **plan mode** (Shift+Tab) e envie: `Leia PROMPT.md e execute. Comece pela Fase 0.`
> 4. Os apêndices contêm rascunhos já escritos e validados (templates .NET compilados e testados em runtime;
>    templates Angular com type-check strict). O Claude Code deve usá-los como ponto de partida, não como verdade absoluta.

---

## 1. Missão

Construir, neste repositório, um **marketplace de plugins do Claude Code** contendo o plugin **`otel-signoz`**.
Quando executado em qualquer repositório da Target (ou de cliente), o plugin deve:

1. **Descobrir** os serviços executáveis: APIs .NET, Auth Server, microserviços, workers/filas/jobs,
   Azure Functions e fronts Angular.
2. **Entrevistar** o time: sugerir e confirmar o nome de cada serviço (`<base>-api`, `<base>-auth`, `<base>-ui`...),
   mapear ambientes, estratégia de segredo, canal de suporte e sampling.
3. **Instrumentar** traces, logs e métricas via OpenTelemetry → SigNoz, com `service.name` fixo e ambiente em
   atributo próprio (`deployment.environment`), **nunca concatenado** ao nome.
4. **Fechar o ciclo de Trace ID**: backend devolve o Trace ID em toda resposta de erro; o front exibe Trace ID,
   botão copiar e orientação de suporte **somente em falha do sistema**, permitindo rastrear
   front → API → Auth → SQL/filas pelo mesmo ID.
5. **Auditar** projetos que já têm observabilidade e **investigar** incidentes via MCP do SigNoz.

Fonte de conhecimento de domínio: `docs/origem/playbook-otel-signoz.md` (playbook original) + as correções da §7,
que **prevalecem** sobre o playbook.

## 2. Contexto

- **Empresa:** Target Software, B2B de tecnologia para o setor financeiro, ~100 pessoas, 100% remota.
- **Stack padrão:** .NET + Angular, SQL Server, Azure, GitHub, M365.
- **Processo (Gitflow Lite):** `feature/*` e `fix/*` com ID do ticket, nascendo da `main`; PR → `develop`
  (homologação) → PR → `main`. Versões de aplicação no formato `vAAAAMMDD.HHMM`, geradas no CI/CD
  (GitHub Actions). API, UI e AUTH são artefatos separados. Produção recebe tag, nunca branch.
- **Políticas:**
  - nada de segredo hardcoded (Azure Key Vault);
  - LGPD;
  - não misturar dados de clientes distintos;
  - todo output de IA revisado por um profissional;
  - nada em produção sem PR revisado, testes e aprovação.
- **Idioma:** todo o conteúdo do plugin em **português do Brasil**, exceto código, identificadores e frontmatter.

## 3. Fase 0 — Antes de criar qualquer arquivo

1. Leia `docs/origem/playbook-otel-signoz.md` inteiro e os apêndices deste prompt.
2. **Confirme o schema atual do Claude Code na documentação oficial** (ela muda com frequência). Leia pelo menos:
   - https://code.claude.com/docs/en/plugins-reference (manifesto, layout, `${CLAUDE_PLUGIN_ROOT}`, `userConfig`)
   - https://code.claude.com/docs/en/plugins/marketplace-reference
   - https://code.claude.com/docs/en/skills (frontmatter: `name`, `description`, `disable-model-invocation`, `argument-hint`, `allowed-tools`)
   - a página de subagentes (frontmatter `name`, `description`, `tools`, `model`)

   Se algo divergir deste prompt, **siga a documentação** e registre a divergência no `CHANGELOG.md`.
3. Faça as perguntas abaixo com `AskUserQuestion`, em uma rodada:
   - **Dono/nome do repositório GitHub** (para `repository` no manifesto e no README).
   - **Marketplace:** criar um novo (`target-plugins`) ou este repo será incorporado a um marketplace Target já
     existente (ex.: onde está o `target-devops`)? Nomes de marketplace e de plugin são **slugs imutáveis**
     depois de publicados — confirme antes de gravar.
   - **Lib de UI padrão** do template de erro: SweetAlert2 (padrão sugerido) · ngx-toastr · Angular Material · outra.
   - **Versionamento do plugin:** SemVer (recomendado para plugin: sinaliza breaking change a quem instala)
     ou `vAAAAMMDD.HHMM` (alinhado ao Gitflow Lite).
4. Apresente o plano de arquivos (§8) e **aguarde aprovação** antes de escrever.

## 4. Decisões de arquitetura (fechadas — não rediscutir)

| Decisão | Motivo |
|---|---|
| **Plugin dentro de um marketplace** (repo = marketplace; plugin em `plugins/otel-signoz/`) | Distribuição para o time, versionamento, namespacing, espaço para futuros plugins Target. |
| **Skills** (não `commands/`) para os pontos de entrada: `setup`, `review`, `investigate` → `/otel-signoz:setup` etc. | Documentação recomenda `skills/` para plugins novos; skills têm pasta para arquivos de apoio e controle de invocação. |
| `setup` com `disable-model-invocation: true` | Altera código: só roda quando o usuário chama. `review` e `investigate` podem ser auto-invocados. |
| **Subagente `discovery`** (somente leitura, `model: sonnet`) | Inventário de repo grande sem poluir o contexto principal; modelo mais barato para varredura. |
| **`references/`** compartilhado na raiz do plugin, lido sob demanda via `${CLAUDE_PLUGIN_ROOT}/references/...` | Progressive disclosure: `SKILL.md` curto (< 500 linhas), conhecimento pesado só quando necessário. |
| **`templates/`** com código validado (C#, TS, docs) | Parte determinística não deve depender de geração livre do modelo. |
| **Sem `bin/`** no plugin | Plugin com `bin/` não é instalado no claude.ai/Cowork nem via distribuição da organização. |
| **Sem MCP do SigNoz empacotado** (v1) | Conta SigNoz é por cliente/projeto; MCP embutido geraria prompt de auth para todos. A skill `investigate` detecta e orienta. |
| **Sem hooks** (v1) | Hook roda em toda sessão com o plugin ativo; guarda de segredo fica para v2, depois de piloto. |
| **Sem `CLAUDE.md` na raiz do plugin** | Não é carregado e o validador avisa. `CLAUDE.md` vai na **raiz do repo** (para quem mantém o plugin). |

## 5. Regras de produto (o que o plugin impõe nos projetos-alvo)

A fonte de verdade é o **Apêndice A** (`references/00-principios.md`). Resumo obrigatório:

1. **Identidade do serviço**
   - `service.name` idêntico em todos os ambientes; ambiente em `deployment.environment` **e**
     `deployment.environment.name`, com valores `development | homolog | production`;
   - `service.namespace = <base>`;
   - `service.version = vAAAAMMDD.HHMM` (injetada pelo CI/CD).
2. **Contrato de erro**
   - header `X-Trace-Id` em **toda** resposta, mais `traceId` (32 hex) no corpo de erro;
   - o front exibe o bloco de suporte só para status `0` ou fora de `{400, 401, 403, 404, 422, 429}`.
3. **Propagação**: `traceparent` apenas para API/AUTH próprios. Nunca para domínios Microsoft/terceiros,
   porque o preflight CORS recusado **quebra login**.
4. **Segredos**
   - backend: user-secrets local; Key Vault ou variável no deploy;
   - front: placeholder `__SIGNOZ_INGESTION_KEY__` substituído no pipeline, com chave separada por UI e por ambiente;
   - sem chave, a aplicação sobe e só não exporta.
5. **LGPD**
   - `enduser.id` apenas com ID opaco;
   - nunca capturar parâmetros SQL;
   - alertar sobre PII em rotas;
   - conta SigNoz compartilhada entre clientes = alerta.
   - SigNoz Cloud **não tem região no Brasil** (EUA, UE, Índia): para clientes financeiros, validar antes de
     produção, com alternativa self-hosted ou gerenciado na nuvem do cliente.
6. **Custo** — alavancas, nesta ordem:
   1. filtrar health/swagger;
   2. nível de log;
   3. cliques no front;
   4. sampling por último.

   Sampling abaixo de 100% quebra a promessa "todo Trace ID exibido existe no SigNoz".
7. **Herdar, não substituir**: projeto com App Insights/OTel/Serilog/handler existente é estendido, nunca reescrito.
8. **Governança**: branch `feature/<TICKET>-observabilidade-otel`; PR → `develop`; build/testes verdes; push/PR só
   com confirmação.

## 6. Fatos verificados (não contradizer sem evidência nova)

Validado em set/2026: .NET 8.0 SDK + OpenTelemetry 1.19.x (templates compilados e testados via HTTP) e Angular 19.2 + OpenTelemetry JS 2.11 (type-check).

| Fato | Evidência |
|---|---|
| `UseTraceIdHeader()` coloca `X-Trace-Id` em 200/400/404/409/500 | smoke test |
| `traceId` no corpo do handler próprio = header (32 hex) | smoke test |
| `[ApiController]` (400 automático) e `Problem()` do MVC recebem `traceId` via `PostConfigure<ProblemDetailsOptions>`, normalizado para 32 hex (o padrão do ASP.NET é W3C longo `00-…-…-01`) | smoke test |
| `Results.Problem` de **minimal API no .NET 8** não recebe `traceId` no corpo, mesmo com `AddProblemDetails()` | smoke test — o header cobre; **reverificar em .NET 9/10** |
| Propagação manual em fila injeta `traceparent` com o mesmo Trace ID da requisição | smoke test |
| Sem Endpoint/IngestionKey a app sobe; tracing continua ativo (Trace ID nas respostas) | smoke test |
| `ActivityExtensions.RecordException` está **obsoleto** no OTel 1.19; `Activity.AddException` funciona em net8 (DiagnosticSource 9+ transitivo) | build |
| NuGet (set/2026): `OpenTelemetry.Instrumentation.SqlClient` **estável** 1.19.0; `EntityFrameworkCore`, `Hangfire`, `StackExchangeRedis` só **beta**; `RabbitMQ.Client.OpenTelemetry` em **rc**; `Microsoft.Azure.Functions.Worker.OpenTelemetry` estável 1.2.0 | nuget.org |
| SqlClient 1.19 expõe `RecordException`, `Filter`, `EnrichWithSqlCommand`, `SetDbQueryParameters`, `RecordReturnedRows`, `EnableTraceContextPropagation` | XML docs do pacote |
| SigNoz usa `deployment.environment` nos filtros de Services/Logs; docs recentes também usam `deployment.environment.name` | docs SigNoz |
| Templates Angular passam `tsc --strict` com Angular 19.2 + `@opentelemetry/*` 2.11 (`resourceFromAttributes`, `spanProcessors` no construtor) | type-check |
| **Não validado ainda:** `claude plugin validate`; comportamento em runtime do front; .NET 9/10 | — faça nas Fases 2 e 4 |

## 7. Correções obrigatórias ao playbook original

| Playbook | Problema | Correção |
|---|---|---|
| `EnrichWithHttpRequest` para `enduser.id` | Roda antes do middleware de autenticação: `User` sempre anônimo | `EnrichWithHttpResponse` |
| `serviceName += "-dev"` e `serviceName: '<nome>-ui[-dev\|-homolog]'` | Fragmenta o serviço por ambiente | Nome fixo e ambiente em `deployment.environment` + `.name` |
| `npm install @opentelemetry/context-zone`, mas `import … context-zone-peer-dep` | Dois zone.js no app (provável origem do warning da seção 6) | Instalar e importar `@opentelemetry/context-zone-peer-dep` |
| `IngestionKey` no `appsettings.json` | Viola a política de segredos | user-secrets / Key Vault / variável |
| `config["Observability:Endpoint"]!` | Derruba a app se faltar configuração | Degradar sem exportar |
| Regex `^${apiUrl}` | Casa `api.x.com.evil.com` | Borda `([/?#]\|$)` |
| `RecordException` | Obsoleto | `Activity.AddException` |
| `SqlClient --prerelease` | Hoje é estável | Sem `--prerelease` (manter para EF Core, Hangfire, Redis) |
| Só campo `traceId` no corpo | Não cobre retornos customizados, downloads (Blob) nem respostas fora do handler | Header `X-Trace-Id` como canal primário + `WithExposedHeaders` no CORS |
| `TelemetryService` sem guarda de plataforma | Quebra em Angular SSR | `isPlatformBrowser(PLATFORM_ID)` |
| Toast com `innerHTML` da mensagem do servidor | XSS | Escapar HTML |
| `navigator.clipboard` apenas | Não funciona em intranet HTTP | Fallback `execCommand('copy')` |
| Sampling não tratado | Trace ID exibido pode não existir | 100% padrão; tail sampling no Collector se precisar reduzir |

## 8. Especificação do repositório

```
<repo>/
├── .claude-plugin/marketplace.json
├── .github/workflows/validate.yml
├── CLAUDE.md                          # para quem mantém o plugin (não é carregado pelo plugin)
├── README.md
├── docs/origem/playbook-otel-signoz.md
└── plugins/otel-signoz/
    ├── .claude-plugin/plugin.json
    ├── README.md
    ├── CHANGELOG.md
    ├── agents/discovery.md
    ├── skills/
    │   ├── setup/SKILL.md
    │   ├── review/SKILL.md
    │   └── investigate/SKILL.md
    ├── references/
    │   ├── 00-principios.md
    │   ├── dotnet-backend.md
    │   ├── auth-server.md
    │   ├── mensageria-workers.md
    │   ├── contrato-de-erro.md
    │   ├── angular-frontend.md
    │   ├── pipeline-segredos.md
    │   └── troubleshooting.md
    ├── templates/
    │   ├── dotnet/ ObservabilityConfiguration.cs · TraceIdResponseExtensions.cs · MessagingTracePropagation.cs · appsettings.Observability.snippet.jsonc
    │   ├── angular/ telemetry.service.ts · trace-id.util.ts · error.interceptor.ts · error-notification.service.ts · environment.snippet.ts
    │   └── docs/observabilidade.md
    └── tests/cenarios.md
```

### 8.1 Manifestos
- `marketplace.json`: `name`, `owner.name`, `metadata.description/version`, `plugins[]` com `name`, `source: "./plugins/otel-signoz"`, `description`.
- `plugin.json`: `name`, `displayName`, `version`, `description`, `author`, `repository`, `keywords`.
  **`version` fixa os usuários naquela versão até ser alterada** — toda release incrementa e registra no CHANGELOG.

### 8.2 `agents/discovery.md`
Rascunho no **Apêndice C**. Requisitos:
- somente leitura;
- serviço = **unidade de deploy** (não class library);
- detecta todos os itens das tabelas do rascunho (versões, bootstrap, auth + se o claim pode ser e-mail, dados,
  mensageria com versão, `new HttpClient`, observabilidade existente, handler central, envelope e **erro com
  HTTP 200**, top 10 pontos customizados com `arquivo:linha`, CORS, segredos — **nome da chave, nunca o valor** —,
  ambientes, rotas com PII);
- saída em formato fixo.

### 8.3 `skills/setup/SKILL.md`
Rascunho no **Apêndice B**. Requisitos:
- **Fases:**
  1. pré-voo (branch Gitflow);
  2. descoberta via subagente;
  3. validação do inventário ⏸;
  4. entrevista ⏸;
  5. plano + `docs/observabilidade.md` ⏸;
  6. implementação;
  7. verificação;
  8. entrega (resumo, pendências manuais, commits, rascunho de PR → `develop`, sem push sem confirmação).
- **Entrevista em até 3 rodadas com `AskUserQuestion`**, sempre com sugestão pronta:
  - **A** — base/namespace, destino SigNoz + conta dedicada?, mapeamento de ambientes, estratégia de segredo;
  - **B** — nome de cada serviço (lotes de 4; recusar sufixo de ambiente);
  - **C** — canal de suporte, escopo dos pontos customizados, sampling, nome do campo de correlação se já existir.
- **Modo complemento:** se `docs/observabilidade.md` existir no alvo, reutilizar as decisões.
- Suporte a **multi-repo**: serviço em outro repo é registrado como "fora deste repo"; executar o plugin lá
  reutilizando os mesmos nomes.
- `description` "insistente" o bastante para ser encontrada, mas `disable-model-invocation: true`.

### 8.4 `skills/review/SKILL.md` (escrever — sem rascunho)
- Auditoria **somente leitura**:
  1. usa o subagente `discovery`;
  2. avalia o checklist;
  3. gera relatório.
- **Checklist mínimo** (seção 4 do playbook + regras deste prompt):
  - [ ] `IHttpClientFactory` vs `new HttpClient`
  - [ ] `catch` vazio
  - [ ] `traceId` em todo erro + `X-Trace-Id` exposto no CORS
  - [ ] front exibe Trace ID só em falha do sistema
  - [ ] mensagem sem estrutura interna
  - [ ] AUTH separado com instrumentação própria
  - [ ] propagação restrita
  - [ ] `enduser.id` opaco
  - [ ] workers/Functions com configuração própria
  - [ ] `service.name` sem sufixo de ambiente
  - [ ] `deployment.environment` presente
  - [ ] `service.version` injetada
  - [ ] segredo versionado (nome da chave)
  - [ ] `SetDbQueryParameters` desligado
  - [ ] sampling vs promessa de suporte
  - [ ] health checks filtrados
  - [ ] erro com HTTP 200
  - [ ] dashboards/alertas inexistentes = dívida
- **Relatório:** tabela `Severidade (Crítico/Alto/Médio/Baixo) · Item · Evidência (arquivo:linha) · Correção · Esforço (P/M/G)`,
  resumo executivo de 3 linhas no topo e próximos passos.
- Só grava `docs/observabilidade-review.md` se o usuário pedir.
- A seção **"Checklist"** deve ser citável: o `setup` a referencia na Fase de verificação.

### 8.5 `skills/investigate/SKILL.md` (escrever — sem rascunho)
- `argument-hint: "[trace-id ou descrição do sintoma]"`.
- Verifica se há tools do MCP do SigNoz na sessão. Se não houver, orienta:
  - setup `claude mcp add --scope user --transport http signoz https://mcp.us.signoz.cloud/mcp` (URL conforme região da conta);
  - a URL da instância e a API key de **leitura** (≠ ingestion key);
  - a necessidade de **nova sessão** após autorizar.
- **Fluxos:**
  1. com Trace ID → árvore completa de spans;
  2. só sintoma → logs `ERROR` na janela, pegar `traceId`, voltar ao fluxo 1;
  3. lentidão → duração por rota e separar banco / HTTP externo / processamento;
  4. correlação front↔back → pedir os dois lados;
  5. **login** → buscar no serviço `-auth` por atributo, não por Trace ID da SPA.
- **Cuidados:**
  - confirmar conta dedicada ao cliente antes de buscas amplas;
  - serviço sem instrumentação não aparece (não é bug);
  - nunca colar no chat dados pessoais vistos em spans/logs além do necessário.
- **Saída:** linha do tempo do trace, causa provável com evidência, próximos passos e rascunho de resposta ao
  usuário/suporte (sem expor detalhe interno).

### 8.6 `references/`
Rascunhos de `00-principios`, `dotnet-backend`, `auth-server`, `mensageria-workers` e `contrato-de-erro` no
**Apêndice D**. Revise contra as §§5–7 e escreva os que faltam:

- **`angular-frontend.md`**
  - compatibilidade: `< 14` NgModule + `APP_INITIALIZER`; 14–18 `APP_INITIALIZER` objeto; 19+ `provideAppInitializer`;
    interceptors funcionais 15+ vs class-based; zoneless → `StackContextManager`; SSR → `isPlatformBrowser`;
    `withFetch()` coberto pela `FetchInstrumentation`;
  - pacotes com **`context-zone-peer-dep`**;
  - registro por versão;
  - `propagateTo` com API **e** endpoint de token do AUTH; exclusão explícita de domínios Microsoft/MSAL;
  - CORS/preflight;
  - config em runtime (`assets/config.json`) como alternativa quando o projeto já usa;
  - local com `enabled: false`;
  - como adaptar o `ErrorNotificationService` para toastr/Material/PrimeNG: falha do sistema = **diálogo**
    (precisa de botão copiar), domínio = toast;
  - `SKIP_GLOBAL_ERROR_UI` nos pontos customizados.
- **`pipeline-segredos.md`**
  - Key Vault: App Service Key Vault reference `@Microsoft.KeyVault(SecretUri=…)` ou `AddAzureKeyVault`
    com o segredo `Observability--IngestionKey`;
  - variável `Observability__IngestionKey`;
  - GitHub Actions: secrets por Environment (homolog/production); passo `sed` substituindo `__SIGNOZ_INGESTION_KEY__`
    e `__APP_VERSION__` **antes** do `ng build`;
  - versão no backend via `-p:InformationalVersion=$VERSION` ou `Observability__ServiceVersion`;
  - chaves separadas por UI/ambiente; rotação; nunca ecoar segredo em log;
  - build-once vs config por ambiente no front;
  - regra: **propor diff de pipeline e perguntar antes de editar**.
- **`troubleshooting.md`** — seção 6 do playbook corrigida, mais:
  - nada chega ao SigNoz (chave/endpoint/sufixo `/v1/*`/firewall; log de categoria `OpenTelemetry`);
  - trace front↔back desconectado (regex/CORS `traceparent`);
  - login quebrou após instalar (propagação para domínio de terceiro);
  - header `X-Trace-Id` invisível no front (falta `WithExposedHeaders`);
  - toast duplicado (tratamento local sem `SKIP_GLOBAL_ERROR_UI`);
  - Serilog engolindo o provider OTel;
  - custo alto (health checks, cliques, log `Debug`).

### 8.7 `templates/`
- **Apêndice E** (.NET) e **Apêndice F** (Angular): use como base, com os ajustes da §7 já aplicados.
- **Template novo `templates/docs/observabilidade.md`**, que o `setup` gera no repo-alvo. Seções:
  - mapa de serviços (`service.name`, tipo, caminho, repo);
  - ambientes;
  - onde está a configuração;
  - segredos (onde criar, **nomes**, nunca valores);
  - contrato de erro;
  - como investigar (Trace ID → SigNoz; login → `-auth`);
  - limitações conhecidas (redirect de login, auth SaaS);
  - decisões (sampling, conta SigNoz, residência de dados);
  - histórico de execuções do plugin (data, versão do plugin, escopo).

### 8.8 `tests/cenarios.md`
Cenários para teste manual/regressão do plugin. Cada um com: repo de exemplo esperado, comportamento esperado
por fase e critério de sucesso.

1. Monorepo API .NET 8 + Angular 19 standalone, sem observabilidade.
2. API com Application Insights clássico.
3. Angular zoneless + SSR.
4. AUTH OpenIddict separado + SPA com PKCE.
5. Worker com RabbitMQ.Client 6.x.
6. API com envelope `{ sucesso, mensagem }` retornando erro com HTTP 200.
7. Projeto com `NameIdentifier` = e-mail.
8. Repo de cliente com padrão de branch diferente.

### 8.9 `README.md` (repo e plugin) e `CLAUDE.md`
- **README do repo:**
  - o que é;
  - instalação: `/plugin marketplace add <owner>/<repo>` e `/plugin install otel-signoz@<marketplace>`;
  - o repo é **privado**: quem instala precisa de acesso de leitura;
  - uso das 3 skills;
  - roadmap v2 (§11).
- **README do plugin:** fluxo, o que muda nos projetos-alvo, pré-requisitos (SDK .NET/Node no projeto-alvo), limitações.
- **`CLAUDE.md` (raiz do repo):**
  - convenções de edição;
  - teste local com `claude --plugin-dir ./plugins/otel-signoz`;
  - `claude plugin validate`;
  - regra de bump de versão + CHANGELOG;
  - "templates só mudam com build verde no workflow".

### 8.10 `.github/workflows/validate.yml`
Três jobs em PR e push na `main`:
1. **Manifesto:**
   - instalar Claude Code e rodar `claude plugin validate ./plugins/otel-signoz --strict` e a validação do marketplace;
   - se o CLI exigir autenticação no CI, cair para validação de JSON (`jq`) + existência de caminhos, e documentar.
2. **Templates .NET:**
   - `setup-dotnet` 8.x;
   - `dotnet new webapi` em diretório temporário;
   - adicionar os pacotes da referência;
   - copiar templates substituindo placeholders;
   - `dotnet build -warnaserror` para os arquivos do template;
   - opcional: smoke test via `curl` checando `X-Trace-Id`.
3. **Templates Angular:**
   - projeto temporário com `@angular/core`, `@angular/common`, `rxjs`, `sweetalert2` e os pacotes `@opentelemetry/*`
     da referência;
   - `tsc --noEmit --strict` sobre os templates.

## 9. Execução em fases (gates ⏸ = aguardar aprovação)

| Fase | Entregas | Gate |
|---|---|---|
| 0 | Leitura, verificação de docs, perguntas iniciais, plano de arquivos | ⏸ |
| 1 | Scaffold: manifestos, estrutura, README/CLAUDE.md esqueleto, branch `feature/otel-signoz-v1` | — |
| 2 | **Templates primeiro**: aplicar §7, compilar .NET e type-check Angular em diretório temporário (fora do repo), smoke test .NET | ⏸ mostrar resultado |
| 3 | Subagente, 3 skills, 8 referências, template de docs, `tests/cenarios.md` | — |
| 4 | `claude plugin validate --strict`; teste local com `claude --plugin-dir` num projeto de exemplo gerado em diretório temporário (API .NET 8 + Angular mínimo): rodar `/otel-signoz:review` e `/otel-signoz:setup` até a Fase 4 do setup (plano) | ⏸ mostrar relatório |
| 5 | Workflow de CI, CHANGELOG `1.0.0`, README final | — |
| 6 | Commits pequenos por área, rascunho de PR. **Sem push sem confirmação** | ⏸ |

## 10. Critérios de aceite

- [ ] `claude plugin validate --strict` passa (ou fallback documentado).
- [ ] Templates .NET compilam sem warning em net8; templates Angular passam `tsc --strict`.
- [ ] Smoke test: `X-Trace-Id` em 200/400/500 e `traceId` igual no corpo do 500.
- [ ] `SKILL.md` com menos de 500 linhas cada; toda referência citada existe; caminhos via `${CLAUDE_PLUGIN_ROOT}`.
- [ ] Nenhum `service.name` com sufixo de ambiente em nenhum exemplo.
- [ ] Nenhum segredo real, nome de cliente ou dado de cliente em nenhum arquivo.
- [ ] Todas as correções da §7 aplicadas; todos os fatos da §6 respeitados.
- [ ] Teste local: `review` gera relatório no formato especificado; `setup` pergunta nome de cada serviço com sugestão.

## 11. Fora do escopo da v1 (registrar no README como roadmap)

1. **Biblioteca compartilhada**
   - extrair os templates para pacotes versionados: NuGet `Target.Observability.*` e npm `@target/observability-angular`,
     em feed privado (GitHub Packages/Azure Artifacts);
   - o plugin passa a instalar o pacote onde permitido e mantém modo template para repos de cliente que proíbem
     feed externo;
   - gatilho: 3+ projetos usando (custo de drift > custo do pacote).
2. **Hook de guarda de segredo:** bloquear escrita de ingestion key literal em arquivos versionados, depois do piloto.
3. **Evals do plugin:** verificar suporte a `experimental.evals`/`claude plugin eval` e transformar `tests/cenarios.md` em casos automatizados.
4. **Dashboards e alertas padrão no SigNoz:** taxa de 5xx por serviço, p95 por rota, erros por versão.

## 12. Não faça

- Não invente API, pacote ou opção: confirme no NuGet/npm/docs ou marque como "a confirmar".
- Não copie apêndices sem revisar contra as §§5–7.
- Não escreva `commands/` nem `bin/`.
- Não coloque dados de cliente, e-mails reais ou chaves em exemplos (use `exemplo.com.br`).
- Não faça push, não crie tag e não abra PR sem confirmação.

---
# APÊNDICES — rascunhos (ponto de partida; revisar contra §§5–7)

## Apêndice A — references/00-principios.md (fonte de verdade das regras)

`plugins/otel-signoz/references/00-principios.md`

````markdown
# Princípios não negociáveis — otel-signoz

O valor deste plugin não é "ter OpenTelemetry". É o par:
**Trace ID sempre presente na resposta de erro** + **Trace ID visível ao usuário só quando for falha do
sistema**, com o mesmo trace atravessando front → API → Auth → SQL/filas.

## 1. Identidade do serviço (resource attributes)

| Atributo | Valor | Regra |
|---|---|---|
| `service.name` | `<base>-api`, `<base>-auth`, `<base>-ui`, `<base>-worker-<x>`, `<base>-func-<x>`, `<base>-svc-<x>` | **Idêntico em todos os ambientes.** Nunca concatenar ambiente (`-dev`, `-hml`). |
| `service.namespace` | `<base>` | Agrupa os serviços do mesmo sistema. |
| `service.version` | `vAAAAMMDD.HHMM` (versão do Gitflow Lite, gerada no CI/CD) | Permite ligar um erro a uma release e decidir rollback. `unknown` localmente. |
| `deployment.environment` | `development` \| `homolog` \| `production` | Usado pelos filtros de ambiente do SigNoz (Services, Logs). |
| `deployment.environment.name` | mesmo valor | Convenção semântica atual do OpenTelemetry. Enviar os dois. |

O ambiente vem de configuração explícita (`Observability:Environment` no back, `observability.environment`
no front). O `EnvironmentName` do host é só fallback, normalizado para os três valores canônicos; um nome
desconhecido é enviado como está (para aparecer no SigNoz e ser corrigido), nunca "chutado".

## 2. Contrato de erro

- Backend devolve o Trace ID (32 hex, formato W3C) em **toda** resposta de erro, por dois canais:
  header `X-Trace-Id` (todas as respostas) e campo `traceId` no corpo (ProblemDetails/envelope próprio).
- Front **exibe** Trace ID + botão copiar + orientação de suporte **somente** para falha do sistema:
  status `0` (rede) ou qualquer status fora de `400, 401, 403, 404, 422, 429`.
- Mensagem ao usuário nunca expõe estrutura interna (tabela, coluna, procedure, stack trace).
- Detalhes: `contrato-de-erro.md`.

## 3. Propagação de contexto

- `traceparent`/`tracestate` só vão para **API e AUTH próprios** (lista explícita no front).
  Nunca para domínios de terceiros (Microsoft login/Graph, gateways de pagamento, CDNs): além de vazar
  contexto, o header extra dispara preflight CORS que o terceiro recusa — **pode quebrar o login**.
- Entre serviços .NET via `HttpClient` a propagação é automática; `new HttpClient()` fora de
  `IHttpClientFactory` continua instrumentado, mas é dívida (socket exhaustion) — reporte.
- Filas e jobs: propagação explícita nos headers da mensagem (`mensageria-workers.md`).

## 4. Segredos (política Target)

- Ingestion key **nunca** em arquivo versionado. Local: `dotnet user-secrets`. Deploy: Azure Key Vault
  (padrão) ou variável de ambiente injetada pelo App Service/pipeline.
- Front: a ingestion key de browser é pública por natureza (só grava). Mesmo assim: placeholder no repo,
  valor injetado no pipeline, **chave separada por UI e por ambiente** (revogável sem afetar o backend).
- Sem endpoint ou chave, a aplicação **sobe normalmente** e só não exporta. Observabilidade nunca derruba
  a aplicação.

## 5. LGPD e dados de clientes

- `enduser.id` só com identificador estável e opaco (`sub`, `oid`, GUID interno). Nunca e-mail, CPF,
  nome ou telefone em atributo de span/log.
- URLs com PII no path/query (ex.: `/clientes/123.456.789-00`) vão para o span. Reporte as rotas afetadas.
- Mensagens de exceção podem carregar valores de dados (ex.: violação de chave duplicada com o valor).
  Elas vão para o SigNoz — trate a conta SigNoz como operadora de dados pessoais (DPA, retenção mínima).
- **Nunca misture clientes** na mesma conta SigNoz sem decisão explícita. Conta compartilhada = alerta.
- SigNoz Cloud tem data centers nos EUA, UE e Índia — **não há região no Brasil**. Para clientes do setor
  financeiro, validar com o cliente (contrato/DPO/política de nuvem) antes de ligar em produção; alternativas:
  SigNoz self-hosted ou gerenciado pela SigNoz na nuvem do próprio cliente.

## 6. Custo e volume

- Custo do SigNoz é proporcional ao volume ingerido. Alavancas, nesta ordem:
  1. Filtrar health checks, swagger e estáticos dos traces.
  2. Nível mínimo de log exportado (`Information` em produção; `Debug` nunca).
  3. Desligar `UserInteractionInstrumentation` no front se não houver uso para cliques.
  4. Sampling — por último. Sampling por cabeça (head-based) decide antes de saber se vai dar erro:
     com < 100%, parte dos Trace IDs exibidos ao usuário **não terá trace completo** no SigNoz (o log de
     erro continua indo, com o mesmo `traceId`). Se precisar reduzir muito, o caminho certo é tail
     sampling num OpenTelemetry Collector, não baixar a razão no SDK.

## 7. Projeto que já tem alguma coisa — herdar, não substituir

| Encontrado | Ação |
|---|---|
| OpenTelemetry exportando para outro backend (Jaeger, Tempo, App Insights, Datadog, Elastic) | Não trocar exportador sem decisão explícita. Adicionar só o que falta: resource attributes (§1), contrato de erro (§2), propagação (§3). |
| Application Insights SDK clássico | `Activity.Current` funciona igual — o contrato de erro não depende de migrar. Migrar para OTLP só se o projeto adotar SigNoz. |
| Serilog/NLog sem tracing | Manter o sink atual; somar OpenTelemetry por cima; enriquecer o logger com `TraceId`/`SpanId`. |
| Handler global de erro sem Trace ID | Não reescrever — acrescentar o campo, preservando o mapeamento exceção → status. |
| Campo de correlação próprio (`correlationId`, `requestId`) | Perguntar: manter o nome ou padronizar. Nunca dois nomes para a mesma coisa. |
| Nada | Aplicar tudo do zero. |

## 8. Governança de entrega

- Branch `feature/<TICKET>-observabilidade-otel` a partir da `main`; PR → `develop` (homologação) antes
  de → `main`. Nada direto em branch protegida.
- Build e testes verdes antes de entregar. Push/PR só com confirmação.
- Todo output é revisado por um profissional antes do merge (política de uso de IA da Target).

````

## Apêndice B — skills/setup/SKILL.md

`plugins/otel-signoz/skills/setup/SKILL.md`

````markdown
---
name: setup
description: Implanta (ou completa) OpenTelemetry → SigNoz no repositório atual — descobre APIs .NET, Auth Server, workers/filas/Functions e fronts Angular, pergunta nome de cada serviço e mapeamento de ambientes, instrumenta traces/logs/métricas com deployment.environment e fecha o ciclo de Trace ID até a tela de erro (botão copiar + orientação de suporte).
argument-hint: "[caminho opcional para limitar o escopo, ex.: src/Api]"
disable-model-invocation: true
---

# /otel-signoz:setup

Você vai implantar observabilidade ponta a ponta (front → API → Auth → SQL/filas) neste repositório.
Escopo opcional informado pelo usuário: `$ARGUMENTS` (vazio = repositório inteiro).

Antes de qualquer coisa, leia **`${CLAUDE_PLUGIN_ROOT}/references/00-principios.md`**. Ele contém as regras
não negociáveis; nenhuma decisão de implementação pode contrariá-lo. As demais referências são lidas sob
demanda, na fase em que forem necessárias.

Siga as fases **em ordem**. As marcações **⏸ PARE** exigem resposta explícita do usuário antes de seguir.
Para perguntas, use a ferramenta `AskUserQuestion` sempre que disponível (opções clicáveis, até 4 perguntas
por chamada); sem ela, pergunte em texto numerado. Sempre traga uma **sugestão** pronta — o usuário só
confirma ou corrige.

---

## Fase 0 — Pré-voo

1. `git status --porcelain`: se houver alterações não commitadas, avise e pergunte se deve continuar.
2. Branch: pergunte o ID do ticket e crie `feature/<TICKET>-observabilidade-otel` **a partir da `main`**
   (Gitflow Lite da Target). Se o repositório for de cliente com padrão próprio de branches, siga o padrão
   do repositório. Nunca trabalhe direto em `main`/`develop`.
3. Se existir `docs/observabilidade.md` de uma execução anterior, leia-o: ele é o contrato de nomes e
   ambientes já decidido — reutilize em vez de perguntar de novo (modo "complemento").

## Fase 1 — Descoberta (somente leitura)

Delegue ao subagente **`otel-signoz:discovery`** (escopo = `$ARGUMENTS` ou raiz do repo). Ele devolve um
inventário padronizado por serviço executável. Não altere nada nesta fase.

Se o subagente não estiver disponível, faça você mesmo a descoberta seguindo
`${CLAUDE_PLUGIN_ROOT}/agents/discovery.md`.

## Fase 2 — Validação do inventário ⏸ PARE

Mostre uma tabela compacta:

| # | Tipo | Caminho | Stack/versão | Observabilidade existente | Nome sugerido |
|---|------|---------|--------------|---------------------------|---------------|

Tipos possíveis: `api`, `auth`, `worker`, `func`, `svc` (microserviço), `ui`, `gateway`.
Pergunte: o inventário está correto? Há serviço em **outro repositório** que participa do fluxo (ex.: Auth
Server em repo separado)? Se sim, registre-o no documento da Fase 4 como "fora deste repo" — o plugin deve
ser executado lá depois, reaproveitando os mesmos nomes.

Se algum serviço **já tiver** OpenTelemetry/Application Insights/Datadog/Elastic, aplique a tabela de
adaptação de `${CLAUDE_PLUGIN_ROOT}/references/00-principios.md` §7 (herdar, não substituir) e confirme
com o usuário antes de seguir.

## Fase 3 — Entrevista ⏸ PARE

Pergunte **só o que não for inferível** do inventário. Agrupe em no máximo 3 rodadas.

**Rodada A — global**
1. **Nome base / namespace** do sistema (sugestão derivada do nome da solution/repo, kebab-case, ex.:
   `intranet`). Vira `service.namespace` e prefixo dos nomes.
2. **Destino SigNoz**: Cloud (região `us`, `eu` ou `in`) ou self-hosted (URL). E: a conta é **dedicada a
   este cliente/projeto**? (Se for compartilhada entre clientes, alerte — ver princípios §5.)
3. **Mapeamento de ambientes**: mostre os nomes encontrados (`ASPNETCORE_ENVIRONMENT`, `appsettings.*.json`,
   `environment.*.ts`, workflows) e a sugestão de mapeamento para os três valores canônicos
   `development` | `homolog` | `production`.
4. **Segredo da ingestion key (backend)**: Azure Key Vault (padrão Target) · variável de ambiente injetada
   pelo App Service/pipeline · padrão já existente no repo (cite o que foi detectado).

**Rodada B — nome de cada serviço** (uma pergunta por serviço, em lotes de até 4)
- Sugestão: `<base>-api`, `<base>-auth`, `<base>-ui`, `<base>-worker-<nome>`, `<base>-func-<nome>`,
  `<base>-svc-<nome>`. Ofereça a sugestão e uma alternativa; o usuário pode digitar outra.
- Regra: lowercase, kebab-case, **sem sufixo de ambiente** (`-dev`, `-hml`, `-prod` são proibidos —
  ambiente vai em `deployment.environment`). Recuse e explique se o usuário pedir sufixo.

**Rodada C — contrato de erro, suporte e custo**
1. **Canal de suporte** exibido na tela de erro: e-mail (qual?) · URL de abertura de chamado · ambos.
2. **Pontos customizados de erro** detectados (liste os principais com `arquivo:linha`): ajustar o
   centralizado + os N principais listados (recomendado) · todos · só o centralizado.
3. **Sampling em produção**: 100% (recomendado — garante que todo Trace ID mostrado ao usuário existe no
   SigNoz) · 50% · 10%. Explique o trade-off em uma linha (princípios §6).
4. Só se detectado campo de correlação próprio (`correlationId`, `requestId`): manter o nome existente
   ou padronizar em `traceId`?

## Fase 4 — Plano ⏸ PARE

1. Gere `docs/observabilidade.md` a partir de `${CLAUDE_PLUGIN_ROOT}/templates/docs/observabilidade.md`
   com as decisões da entrevista (mapa de serviços, ambientes, contrato de erro, segredos, como investigar).
2. Apresente o plano **arquivo por arquivo**, agrupado por serviço: arquivo · ação (criar/editar) · motivo.
   Inclua pacotes a instalar e alterações de pipeline propostas.
3. Aguarde aprovação explícita.

## Fase 5 — Implementação

Ordem: **API → AUTH → workers/funcs/svc → UI → pontos customizados de erro → pipeline**. Um serviço por vez;
compile ao final de cada um antes de passar ao próximo.

| Serviço | Referência obrigatória | Templates |
|---|---|---|
| API / svc (.NET) | `${CLAUDE_PLUGIN_ROOT}/references/dotnet-backend.md` | `templates/dotnet/ObservabilityConfiguration.cs`, `TraceIdResponseExtensions.cs` |
| AUTH | `${CLAUDE_PLUGIN_ROOT}/references/auth-server.md` | mesmos da API |
| Worker / fila / Functions | `${CLAUDE_PLUGIN_ROOT}/references/mensageria-workers.md` | `ObservabilityConfiguration.cs` (sem bloco `[WEB]`), `MessagingTracePropagation.cs` |
| Contrato de erro (back + front) | `${CLAUDE_PLUGIN_ROOT}/references/contrato-de-erro.md` | `TraceIdResponseExtensions.cs`, `angular/*` |
| UI (Angular) | `${CLAUDE_PLUGIN_ROOT}/references/angular-frontend.md` | `templates/angular/*` |
| Pipeline e segredos | `${CLAUDE_PLUGIN_ROOT}/references/pipeline-segredos.md` | — |

Templates ficam em `${CLAUDE_PLUGIN_ROOT}/templates/`. Copie, substitua os placeholders `__NAMESPACE__`,
`__SERVICE_NAME__` etc. e **adapte ao estilo do projeto** (namespaces, pastas, convenções de nome). Nunca
cole template que conflite com algo existente — componha.

Regras durante a implementação:
- **Compor, não reescrever**: handler global, interceptor, CORS e `CustomizeProblemDetails` existentes são
  estendidos, preservando toda a lógica atual.
- **Zero segredo em arquivo versionado**. Local: `dotnet user-secrets`; deploy: Key Vault/variável de
  ambiente; front: placeholder `__SIGNOZ_INGESTION_KEY__` substituído no pipeline.
- Pipeline (`.github/workflows`, `azure-pipelines*.yml`): **proponha o diff e pergunte antes de editar** —
  o CI/CD é governado separadamente.
- Se um pacote NuGet/npm não resolver na versão do projeto, pare e reporte; não force upgrade de
  framework para caber a instrumentação.

## Fase 6 — Verificação

1. `dotnet build` em cada projeto .NET alterado; `npm run build` (ou `npx ng build`) em cada front.
2. Rode os testes existentes se forem rápidos (`dotnet test`, testes do front em modo não-watch); pergunte
   antes se a suíte for longa.
3. Smoke test opcional (pergunte): subir a API localmente e chamar uma rota inexistente e uma que gere
   erro → conferir header `X-Trace-Id` e campo `traceId` no corpo.
4. Rode mentalmente o checklist de `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` (seção Checklist) e
   corrija o que faltar.

## Fase 7 — Entrega

1. Resumo em tabela: serviço · `service.name` · o que foi instrumentado · arquivos alterados.
2. Pendências manuais explícitas: segredos a criar no Key Vault/GitHub, variáveis no App Service,
   alteração de CORS em ambientes, contas SigNoz.
3. Commits pequenos por serviço (mensagens em PT-BR, prefixo do ticket).
4. Rascunho da descrição do PR **→ develop** (homologação primeiro). **Não faça push nem abra PR sem
   confirmação.**
5. Lembre: validar em homologação procurando um Trace ID real no SigNoz antes do PR → main.

````

## Apêndice C — agents/discovery.md

`plugins/otel-signoz/agents/discovery.md`

````markdown
---
name: discovery
description: Inventaria em modo somente leitura os serviços executáveis de um repositório para o plugin otel-signoz — APIs .NET, Auth Server, workers/filas/jobs, Azure Functions e fronts Angular — com versões, bootstrap, autenticação, acesso a dados, mensageria, observabilidade existente, pontos de tratamento de erro, CORS e ambientes. Use antes de qualquer alteração de observabilidade.
tools: Read, Grep, Glob, Bash
model: sonnet
---

Você é um auditor **somente leitura**. Não crie, edite nem apague arquivos. Não rode build, restore ou
install. Bash só para comandos de leitura (`git ls-files`, `cat`, `grep`, `find`, `head`).

Ignore sempre: `bin/`, `obj/`, `node_modules/`, `dist/`, `.angular/`, `packages/`, `*.min.js`.

## 1. Unidades executáveis (o que vira `service.name`)

Um serviço é uma **unidade de deploy**, não um projeto qualquer:
- `.csproj` com `Sdk="Microsoft.NET.Sdk.Web"` → API, Auth ou gateway.
- `.csproj` com `Sdk="Microsoft.NET.Sdk.Worker"` ou `<OutputType>Exe</OutputType>` + `Host.CreateApplicationBuilder`/`CreateDefaultBuilder` → worker.
- Referência a `Microsoft.Azure.Functions.Worker` (isolated) ou `Microsoft.NET.Sdk.Functions` (in-process) → func.
- `angular.json` → um item por projeto `application` declarado.
- Class libraries **não** são serviços; anote só se concentrarem tratamento de erro ou acesso a dados compartilhado.
- `docker-compose*.yml`, `*.bicep`, `*.tf`, `.github/workflows/*`, `azure-pipelines*.yml`: use para confirmar quais projetos são publicados e com que nomes.

Classifique como `auth` quando houver `Duende.IdentityServer`, `IdentityServer4`, `OpenIddict.Server`,
endpoints `/connect/token`/`/connect/authorize`, ou Keycloak em compose/infra.

## 2. Para cada serviço .NET, colete

| Item | Como detectar |
|---|---|
| TargetFramework | `<TargetFramework(s)>` |
| Bootstrap | `WebApplication.CreateBuilder` / `Host.CreateApplicationBuilder` / `Startup.cs` |
| Autenticação | `AddAuthentication`, `AddJwtBearer`, `AddOpenIdConnect`, `AddMicrosoftIdentityWebApi`, `AddCookie`, `OpenIddict.Validation`; qual claim identifica o usuário (`sub`, `oid`, `NameIdentifier`) e **se esse claim pode ser e-mail** |
| Dados | `Microsoft.Data.SqlClient`, `System.Data.SqlClient`, EF Core (+ provider), Dapper, Npgsql, MongoDB.Driver, StackExchange.Redis |
| Mensageria/jobs | `Azure.Messaging.ServiceBus`, `RabbitMQ.Client` (versão!), `MassTransit`, `Hangfire`, `Quartz`, `Confluent.Kafka`, `Azure.Storage.Queues`, subclasses de `BackgroundService`/`IHostedService` |
| HTTP de saída | `AddHttpClient`/`IHttpClientFactory` vs `new HttpClient(` (liste arquivos) |
| Observabilidade existente | `OpenTelemetry*`, `Microsoft.ApplicationInsights*`, `Azure.Monitor.OpenTelemetry*`, `Datadog*`, `Elastic.Apm*`, `Serilog*`, `NLog*` |
| Tratamento de erro central | `UseExceptionHandler`, `IExceptionHandler`, middleware próprio com `try/catch` em `InvokeAsync`, `IExceptionFilter`/`ExceptionFilterAttribute`, `AddProblemDetails`, `CustomizeProblemDetails`, `InvalidModelStateResponseFactory` |
| Envelope de resposta | classes tipo `ApiResponse`, `Result<T>`, `ResponseDto` com campos `sucesso`/`success`/`mensagem`/`message`/`erros`; **sinalize se erros são devolvidos com HTTP 200** |
| Pontos customizados de erro | `StatusCode(500`, `StatusCode(StatusCodes.Status5`, `Problem(`, `BadRequest(new`, `return new ObjectResult` com status de erro, `catch` que monta resposta; liste os **10 mais relevantes** com `arquivo:linha` |
| `catch` vazio / engolido | `catch { }`, `catch (Exception) { }` sem log |
| CORS | `AddCors`/`WithOrigins`/`WithHeaders`/`AllowAnyHeader`/`WithExposedHeaders` — se há lista explícita de headers (precisará incluir `traceparent`, `tracestate` e expor `X-Trace-Id`) |
| Segredos | `AddAzureKeyVault`, `@Microsoft.KeyVault(`, `UserSecretsId`, segredos em `appsettings*.json` (reporte **o nome da chave, nunca o valor**) |
| Ambientes | `appsettings.*.json`, `launchSettings.json` (`ASPNETCORE_ENVIRONMENT`/`DOTNET_ENVIRONMENT`), workflows |
| Health checks | `MapHealthChecks`, rotas `/health`, `/ready`, `/swagger` |
| Rotas com PII | rotas com `{cpf}`, `{email}`, `{documento}` ou query strings equivalentes |

## 3. Para cada front Angular, colete

| Item | Como detectar |
|---|---|
| Versão | `@angular/core` em `package.json` |
| Estilo | standalone (`app.config.ts`, `bootstrapApplication`) ou `NgModule` (`AppModule`) |
| Zoneless / SSR | `provideZonelessChangeDetection`/`provideExperimentalZonelessChangeDetection`; `@angular/ssr`/`server.ts` |
| HttpClient | `provideHttpClient(...)` com `withFetch()`? `withInterceptors([...])` ou `HTTP_INTERCEPTORS` |
| Interceptors existentes | arquivo e responsabilidade (auth, erro, loading) |
| Lib de notificação | `sweetalert2`, `ngx-toastr`, `@angular/material` (`MatSnackBar`/`MatDialog`), `primeng` (toast/dialog), componente próprio |
| Tratamento local de erro | `subscribe({ error:` e `catchError(` que exibem mensagem própria; liste os **10 mais relevantes** |
| Configuração por ambiente | `src/environments/*.ts` + `fileReplacements` no `angular.json`; ou config em runtime (`assets/config.json`, `env.js`) |
| URLs de backend | nome da propriedade (`apiUrl`, `baseUrl`, ...) e valores por ambiente; URL do Auth |
| OIDC | `angular-oauth2-oidc`, `angular-auth-oidc-client`, `@azure/msal-angular` (implica **não** propagar para domínios Microsoft) |
| Telemetria existente | `@opentelemetry/*`, `@microsoft/applicationinsights-web`, `@datadog/browser-rum`, Sentry |

## 4. Transversal

- Workflows de CI/CD: onde a versão `vAAAAMMDD.HHMM` é gerada; onde segredos são injetados.
- `docs/observabilidade.md` existente (execução anterior do plugin).
- Nome sugerido da base: nome da solution (`*.sln`/`*.slnx`) ou do repo, em kebab-case, sem prefixo de cliente
  a menos que o repo seja de um cliente específico.

## 5. Formato de saída (obrigatório)

```
# Inventário otel-signoz
Base sugerida: <base> · Solution: <arquivo> · Workflows: <lista>

## SVC-<n> · <tipo> · <caminho do projeto>
- Nome sugerido: <base>-<tipo>[-<nome>]
- Stack: <net8.0 | Angular 19 standalone zone.js | ...> · Bootstrap: <...>
- Autenticação: <...> · Claim de usuário: <...> (pode ser e-mail? sim/não)
- Dados: <...>
- Mensageria/jobs: <... com versão>
- HTTP de saída: <factory | N ocorrências de new HttpClient: arquivos>
- Observabilidade existente: <nenhuma | ...>
- Erro central: <arquivo:linha — tipo> · Envelope: <nome/campos> · Erro com HTTP 200: <sim/não>
- Pontos customizados (top 10): <arquivo:linha — descrição>
- CORS: <...>
- Segredos: <padrão detectado> · Ambientes: <lista>
- Riscos: <catch vazio, PII em rota, segredo versionado (nome da chave), etc.>
```

Seja factual: marque como `não encontrado` o que não achou; nunca presuma.

````

## Apêndice D — references/dotnet-backend.md

`plugins/otel-signoz/references/dotnet-backend.md`

````markdown
# Backend .NET — API, AUTH e microserviços HTTP

## 1. Compatibilidade

| Alvo | Como aplicar o template |
|---|---|
| .NET 8, 9, 10 | `ObservabilityConfiguration.cs` como está (`IHostApplicationBuilder`). |
| .NET 6, 7 | Troque `IHostApplicationBuilder` por `WebApplicationBuilder` (worker: `IHostBuilder` + `ConfigureServices`/`ConfigureLogging`). `TraceIdResponseExtensions.AddTraceIdToProblemDetails` exige .NET 7+; em .NET 6 omita — o front normaliza o formato W3C. |
| .NET Core 3.1 / 5 / `Startup.cs` | Extensão recebendo `IServiceCollection` + `IConfiguration` + `IHostEnvironment`, chamada em `ConfigureServices`; logging via `ConfigureLogging` no `Program`. |
| .NET Framework 4.x | Fora do escopo automático. Reporte e pergunte. |

## 2. Pacotes

```bash
dotnet add package OpenTelemetry.Extensions.Hosting
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
dotnet add package OpenTelemetry.Instrumentation.AspNetCore     # só API/AUTH
dotnet add package OpenTelemetry.Instrumentation.Http
dotnet add package OpenTelemetry.Instrumentation.Runtime
dotnet add package OpenTelemetry.Instrumentation.SqlClient                # SQL Server (estável) (ADO.NET, Dapper, EF Core SqlServer)
# EF Core com outro provider (Npgsql/MySql):   OpenTelemetry.Instrumentation.EntityFrameworkCore --prerelease
# Redis:                                        OpenTelemetry.Instrumentation.StackExchangeRedis --prerelease
```

- Use o mesmo major/minor para todos os pacotes `OpenTelemetry.*` do projeto.
- `EntityFrameworkCore`, `Hangfire` e `StackExchangeRedis` seguem em beta (`--prerelease`); `SqlClient` já é
  estável. Confira o estado atual no NuGet antes de instalar.
- Se o projeto usar **Central Package Management** (`Directory.Packages.props`), adicione as versões lá.
- Projeto em **net6/net7**: verifique o `TargetFramework` mínimo suportado pela versão mais recente dos
  pacotes antes de instalar; se não suportar, fixe a última versão compatível e registre no
  `docs/observabilidade.md`.

## 3. Registro no `Program.cs`

```csharp
builder.AddObservability();                    // depois de AddAuthentication/AddAuthorization, antes do Build()
builder.Services.AddTraceIdToProblemDetails(); // .NET 7+
var app = builder.Build();

app.UseTraceIdHeader();                        // cedo no pipeline, antes do handler de exceção
app.UseExceptionHandler(...);                  // o que o projeto já usa — só acrescentar o traceId (contrato-de-erro.md)
```

Extras por serviço via os callbacks:

```csharp
builder.AddObservability(
    tracing => tracing.AddSource("Azure.*").AddRedisInstrumentation(),
    metrics => metrics.AddMeter("MinhaApp.Negocio"));
```

## 4. Configuração

Mescle `templates/dotnet/appsettings.Observability.snippet.jsonc`. Regras:
- `Environment` explícito em cada `appsettings.{Env}.json` com o valor canônico decidido na entrevista.
- `IngestionKey` nunca em arquivo. Local: `dotnet user-secrets` (crie `UserSecretsId` se não existir).
  Deploy: ver `pipeline-segredos.md`.
- `ServiceVersion` normalmente não vai em arquivo: vem do CI/CD (`Observability__ServiceVersion`) ou do
  `InformationalVersion` gravado no build (`-p:InformationalVersion=$VERSION`).

## 5. SQL

- `AddSqlClientInstrumentation` cobre `Microsoft.Data.SqlClient` e `System.Data.SqlClient` (ADO.NET puro,
  Dapper e EF Core SqlServer), incluindo stored procedures.
- **Texto do comando SQL**: verifique nas opções da versão instalada se o texto é capturado e qual o
  padrão. SQL parametrizado é seguro; SQL concatenado com valores (legado) leva dados para o span —
  nesse caso **não** habilite captura de texto e reporte os pontos (é também risco de SQL injection).
- **`SetDbQueryParameters` sempre desligado** (padrão): valores de parâmetro são dados pessoais em potencial.
- `EnableTraceContextPropagation`: confira padrão e custo na versão instalada; só habilite com motivo.

## 6. Autenticação e `enduser.id`

- O template enriquece no **fim** da requisição (`EnrichWithHttpResponse`): no início o middleware de
  autenticação ainda não rodou e `HttpContext.User` é anônimo — enriquecer na requisição não funciona.
- Confira qual claim o projeto usa. Se `NameIdentifier` for e-mail/login (comum em cookie auth), remova-o
  da cadeia de `ResolveUserId` e use o ID interno.

## 7. Armadilhas conhecidas

- **Serilog** substituindo o logging (`UseSerilog()`/`AddSerilog(dispose: true)`): os logs podem não
  passar pelo provider OpenTelemetry. Opções: `writeToProviders: true` no `UseSerilog`, ou sink
  `Serilog.Sinks.OpenTelemetry`. Garanta `TraceId`/`SpanId` nos logs (enricher de `Activity`).
- **Application Insights** já registrado: não registre dois exportadores do mesmo sinal sem decisão
  explícita (custo duplicado).
- **Health checks** em alta frequência (probe do App Service/Kubernetes): já filtrados por `IgnoredPaths`;
  inclua as rotas reais do projeto.
- **CORS com lista explícita de headers**: incluir `traceparent` e `tracestate` em `WithHeaders(...)` e
  `X-Trace-Id` em `WithExposedHeaders(...)`. Sem o expose, o front não lê o header.
- **Gateway/YARP/Ocelot** na frente: ele também é um serviço (`<base>-gateway`) e precisa propagar
  `traceparent` (YARP propaga por padrão).

````

## Apêndice D — references/auth-server.md

`plugins/otel-signoz/references/auth-server.md`

````markdown
# AUTH — Authorization Server como processo próprio

Se a autenticação é só validação de token dentro da API (JWT bearer, `OpenIddict.Validation` local), não
há serviço AUTH: é parte da API. Este guia vale quando AUTH é **processo com deploy próprio** (padrão da
Target: API, UI e AUTH com artefatos separados).

## 1. Instrumentação

| AUTH | O que fazer |
|---|---|
| Código próprio .NET (Duende/IdentityServer4/OpenIddict.Server) | Mesmo tratamento da API (`dotnet-backend.md`), `service.name = <base>-auth`, contrato de erro nos endpoints próprios (telas de login, `/connect/*` customizados). |
| Keycloak self-hosted | Tem suporte a tracing OTel em versões recentes (`KC_TRACING_ENABLED` e correlatas) — confirme a versão antes. Configure endpoint/headers via variáveis do container. |
| Auth0 / Okta / Entra ID (SaaS) | Não exporta OTel. Fonte separada (Auth0 Log Streams, Okta System Log, Entra sign-in logs). Documente a limitação; não force correlação. |

Um processo que é **backend de dados e Authorization Server ao mesmo tempo** é um serviço só: uma
instrumentação, um `service.name` (escolha o papel dominante na entrevista).

## 2. Onde o mesmo Trace ID atravessa — e onde não

| Fluxo | Correlaciona com o front? |
|---|---|
| Browser redirecionado para `/authorize` (Authorization Code, com/sem PKCE) | **Não.** Navegação de página inteira: `traceparent` não viaja. O AUTH abre trace próprio. |
| SPA troca `code` por token via `POST /connect/token` (fetch/XHR) | **Sim**, se a URL do AUTH estiver em `propagateTo` do front e o CORS do AUTH aceitar `traceparent`/`tracestate`. |
| API chama AUTH via `HttpClient` (introspection, JWKS, refresh, client credentials) | **Sim, automático**, desde que o AUTH esteja instrumentado. |
| Validação local de token (assinatura/expiração com chave em cache) | Não há chamada de rede — nada a correlacionar. |

Conclusão operacional (registre no `docs/observabilidade.md`): problema **de login** investiga-se no
serviço `<base>-auth` por atributo (client_id, janela de tempo, usuário tentado — sem logar senha), não
por Trace ID herdado da SPA. Erro **depois** do login correlaciona normalmente front → API → SQL.

## 3. Cuidados específicos

- Não logue `Authorization`, cookies, `code`, `refresh_token`, `client_secret` nem corpo de `/connect/token`.
  A instrumentação padrão não captura headers/corpo — não adicione enrichers que capturem.
- Entra ID / MSAL no front: domínios `login.microsoftonline.com`, `graph.microsoft.com` e afins **fora** de
  `propagateTo` (preflight CORS recusado quebra o login).
- Tela de erro do próprio AUTH (Razor/MVC): aplicar o mesmo padrão visual de suporte com Trace ID
  (`contrato-de-erro.md` §4), já que ela não passa pelo interceptor do Angular.

````

## Apêndice D — references/mensageria-workers.md

`plugins/otel-signoz/references/mensageria-workers.md`

````markdown
# Filas, workers, jobs e Azure Functions

Objetivo: a mensagem publicada durante uma requisição carrega o contexto de trace, e o consumidor abre um
span **filho** dele. Resultado: um único Trace ID do clique no front até o processamento assíncrono.

## 1. Regra de serviço

- Processo separado (Worker Service, Function App, console) = **serviço próprio**, com
  `ObservabilityConfiguration` próprio (sem blocos `[WEB]`) e `service.name` próprio.
- `BackgroundService`/`IHostedService` **dentro** da API = mesmo serviço da API; só precisa de spans
  manuais por unidade de trabalho (`ObservabilityConfiguration.ActivitySource.StartActivity(...)`).
- Um loop de background sem span por item gera um trace eterno ou nenhum trace: sempre um span por
  mensagem/item processado.

## 2. Por tecnologia

| Tecnologia | Caminho | Observações |
|---|---|---|
| **Azure Service Bus** (`Azure.Messaging.ServiceBus`) | Nativo: `AppContext.SetSwitch("Azure.Experimental.EnableActivitySource", true);` no início do `Program` + `tracing.AddSource("Azure.Messaging.ServiceBus.*")` | O SDK propaga contexto nas application properties. Aplicar no publicador **e** no consumidor. Confirme o nome do switch na versão do SDK. |
| **RabbitMQ.Client 7.x** | Nativo: pacote de integração OpenTelemetry do próprio client (ex.: `RabbitMQ.Client.OpenTelemetry`) ou `AddSource` das ActivitySources do client | Confira nome do pacote/fontes na versão instalada. |
| **RabbitMQ.Client 6.x** | Manual: `MessagingTracePropagation` com `BasicProperties.Headers` | Headers chegam como `byte[]` — o helper já trata. |
| **MassTransit 8** | Nativo: `tracing.AddSource("MassTransit")` | Propagação automática entre publish/consume. |
| **Hangfire** | `OpenTelemetry.Instrumentation.Hangfire` → `AddHangfireInstrumentation()` | Cria span por execução de job. Para ligar ao request que enfileirou, verifique o suporte a propagação na versão; se não houver, gravar `traceparent` via job filter e extrair com o helper. |
| **Quartz.NET** | ActivitySource do Quartz (versões recentes) ou span manual por job | Job agendado não tem request de origem: trace começa no job (esperado). |
| **Confluent.Kafka** | Manual: `MessagingTracePropagation` com `Message.Headers` (converter para `IDictionary`) | Sem instrumentação oficial estável. |
| **Azure Storage Queues** / fila em tabela SQL | Manual: gravar `traceparent` junto da mensagem (metadado/coluna) e extrair no consumidor | Para tabela SQL, uma coluna `TraceParent varchar(55)` resolve. |
| **Azure Functions (isolated)** | `Microsoft.Azure.Functions.Worker.OpenTelemetry` + `UseFunctionsWorkerDefaults()` e `"telemetryMode": "OpenTelemetry"` no `host.json` | Confira a documentação atual — o suporte evoluiu entre versões. In-process: reporte como limitação e recomende migração para isolated. |

## 3. Uso do helper manual

```csharp
// Publicador (dentro da requisição HTTP — herda o Trace ID do front)
var headers = new Dictionary<string, object?>();
using (MessagingTracePropagation.StartProducerActivity("pedidos", headers, system: "rabbitmq"))
{
    props.Headers = headers!;
    channel.BasicPublish(exchange, routingKey, props, body);
}

// Consumidor (worker)
using var activity = MessagingTracePropagation.StartConsumerActivity("pedidos", headersReadOnly, system: "rabbitmq");
try { await ProcessarAsync(mensagem, ct); }
catch (Exception ex) { activity.MarkFailed(ex); logger.LogError(ex, "Falha ao processar pedido"); throw; }
```

## 4. Workers e o contrato de erro

Worker não responde ao usuário, então não há tela de erro. O que garante rastreabilidade:
- Log de erro com a exceção dentro do span do consumidor (o log herda `TraceId`).
- Mensagem enviada para DLQ/retry mantém os headers originais — o Trace ID aponta para a requisição de origem.
- Se o resultado do processamento volta ao usuário (status do pedido, notificação), grave o Trace ID junto
  do registro de falha para que a tela de status possa exibi-lo.

````

## Apêndice D — references/contrato-de-erro.md

`plugins/otel-signoz/references/contrato-de-erro.md`

````markdown
# Contrato de erro — Trace ID do backend até a tela

## 1. Backend: três camadas, em ordem de cobertura

| Camada | O que cobre | Como |
|---|---|---|
| **Header `X-Trace-Id`** em toda resposta | Tudo, inclusive retornos customizados em controllers, downloads (Blob) e respostas que não passam pelo handler | `app.UseTraceIdHeader()` + `WithExposedHeaders("X-Trace-Id")` no CORS |
| **`traceId` no ProblemDetails** | 400 automático do `[ApiController]`, `Problem(...)`, handler com ProblemDetails | `services.AddTraceIdToProblemDetails()` (.NET 7+) — compõe com customização existente |
| **`traceId` no handler/envelope próprio** | Middleware/filtro de exceção e envelopes tipo `ApiResponse { sucesso, mensagem }` | `context.MarkErrorAndGetTraceId(ex)` no catch + campo `traceId` no envelope |

Minimal API no .NET 8: `Results.Problem` **não** recebe `traceId` no corpo (verificado) — o header cobre.
O header sozinho já garante o funcionamento; o campo no corpo facilita consumo por terceiros e logs.

### Handler/middleware existente — acrescentar, não reescrever

```csharp
catch (Exception ex)
{
    var traceId = context.MarkErrorAndGetTraceId(ex);     // span marcado como erro + exceção registrada
    _logger.LogError(ex, "Erro não tratado em {Path}", context.Request.Path);   // log correlacionado
    // ... mapeamento exceção → status que o projeto JÁ tem, intocado ...
    await context.Response.WriteAsJsonAsync(new { mensagem, traceId });  // ou o envelope/ProblemDetails do projeto
}
```

- `IExceptionHandler` (.NET 8+): mesmo padrão dentro de `TryHandleAsync`.
- Filtro MVC (`IExceptionFilter`): `context.HttpContext.MarkErrorAndGetTraceId(context.Exception)`.
- Exceções de negócio já mapeadas (400/422/404) também levam `traceId` no corpo — o front decide exibir.

### Envelope próprio

Adicione `traceId` **na classe base do envelope** de erro (um lugar só), preenchido na fábrica/handler.
Se o envelope for montado em muitos controllers, crie um helper único (`ApiError.From(context, mensagem)`) e
substitua nos **pontos customizados priorizados na entrevista** — não em todos de uma vez sem acordo.

### Erro devolvido com HTTP 200 (`sucesso: false`)

O interceptor HTTP do front não vê como erro. Não mude o status sem decisão (quebra contrato com
consumidores). Opções, a decidir com o usuário:
1. Incluir `traceId` no envelope e tratar `sucesso === false` no mesmo serviço de notificação do front.
2. Planejar migração para status corretos em release futura (registrar como dívida).

## 2. Frontend: quando exibir

| Exibir Trace ID + copiar + suporte (falha do sistema) | Não exibir (resposta esperada do domínio) |
|---|---|
| `>= 500` | `400`/`422` — validação/regra de negócio |
| `0` — rede/timeout/servidor inalcançável (sem Trace ID: mostrar data/hora e rota para busca) | `401` — sessão expirada (fluxo de login) |
| Qualquer status fora da lista ao lado (ex.: `405`, `409`, `415`) | `403`, `404`, `429` |

Implementação: `templates/angular/trace-id.util.ts` (`toErrorDetails`) + `error.interceptor.ts` +
`error-notification.service.ts`. A regra fica **só no front**; o backend sempre manda o dado.

## 3. Conteúdo mínimo da mensagem de falha do sistema

1. Mensagem (política de mascaramento do projeto inalterada).
2. **Código do erro (Trace ID)** selecionável.
3. Botão **Copiar detalhes** → copia: sistema, mensagem, Trace ID, data/hora ISO, tela, rota da API (sem
   query string), ambiente e versão. Fallback para `document.execCommand('copy')` quando
   `navigator.clipboard` não existir (HTTP sem TLS em intranet).
4. Orientação: "Se o problema persistir, entre em contato com o suporte ou com o administrador do sistema
   informando este código." + link `mailto:` com assunto/corpo preenchidos e/ou URL de chamado.
5. HTML sempre escapado — a mensagem vem do servidor (risco de XSS).

## 4. Pontos customizados no front

Chamadas que tratam erro localmente (toast próprio no `subscribe({ error })`/`catchError`):
- Se o tratamento local **só exibe mensagem**: remova-o e deixe o interceptor global agir.
- Se precisa de lógica própria (ex.: marcar campo do formulário): mantenha a lógica, marque a chamada
  com `SKIP_GLOBAL_ERROR_UI` e use `ErrorNotificationService.fromHttpError(err)` para exibir — assim o
  Trace ID aparece sem toast duplicado.

## 5. Telas fora do Angular

Páginas de erro Razor/MVC (AUTH, páginas legadas): exibir o mesmo bloco (código + copiar + suporte) usando
`HttpContext.GetTraceId()`.

````

## Apêndice E — templates/dotnet/ObservabilityConfiguration.cs

`plugins/otel-signoz/templates/dotnet/ObservabilityConfiguration.cs`

```csharp
// Template do plugin otel-signoz. Placeholders: __NAMESPACE__, __SERVICE_NAME__.
// .NET 8+: estende IHostApplicationBuilder (WebApplicationBuilder e HostApplicationBuilder implementam).
// .NET 6/7: troque IHostApplicationBuilder por WebApplicationBuilder (ver references/dotnet-backend.md).
// Worker/Function sem ASP.NET Core: remova os blocos marcados [WEB] e o pacote de instrumentação AspNetCore.
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

    /// <summary>Ex.: https://ingest.us.signoz.cloud:443 (sem /v1/...).</summary>
    public string? Endpoint { get; set; }

    /// <summary>NUNCA versionar. Local: dotnet user-secrets. Deploy: Key Vault ou variável Observability__IngestionKey.</summary>
    public string? IngestionKey { get; set; }

    /// <summary>Idêntico em todos os ambientes. Ambiente vai em deployment.environment.</summary>
    public string ServiceName { get; set; } = "__SERVICE_NAME__";

    public string? ServiceNamespace { get; set; }

    /// <summary>vAAAAMMDD.HHMM injetada pelo CI/CD. Fallback: InformationalVersion do assembly.</summary>
    public string? ServiceVersion { get; set; }

    /// <summary>development | homolog | production.</summary>
    public string? Environment { get; set; }

    /// <summary>1.0 = 100%. Abaixo disso, parte dos Trace IDs exibidos ao usuário não terá trace completo.</summary>
    public double SamplingRatio { get; set; } = 1.0;

    /// <summary>Rotas fora dos traces (custo/ruído).</summary>
    public string[] IgnoredPaths { get; set; } = new[] { "/health", "/healthz", "/ready", "/alive", "/swagger", "/favicon.ico" };
}

public static class ObservabilityConfiguration
{
    /// <summary>ActivitySource/Meter para spans e métricas manuais (jobs, consumidores de fila, regras críticas).</summary>
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
        var headers = $"signoz-ingestion-key={options.IngestionKey}"; // outro backend OTLP: troque o nome do header

        if (!exportEnabled)
        {
            // Não derruba a aplicação: tracing continua ativo (Trace ID nas respostas), só não exporta.
            Console.WriteLine($"[Observability] {options.ServiceName}: Endpoint/IngestionKey ausente — exportação OTLP desabilitada.");
        }

        var otel = builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                .AddService(serviceName: options.ServiceName, serviceNamespace: options.ServiceNamespace, serviceVersion: version)
                .AddAttributes(new KeyValuePair<string, object>[]
                {
                    new("deployment.environment", environment),      // filtros de ambiente do SigNoz
                    new("deployment.environment.name", environment), // convenção semântica atual do OTel
                }));

        otel.WithTracing(tracing =>
        {
            tracing
                .AddSource(SourceName)
                .SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(options.SamplingRatio)))
                // >>> [WEB] somente API/AUTH (ASP.NET Core)
                .AddAspNetCoreInstrumentation(o =>
                {
                    o.RecordException = true;
                    o.Filter = ctx => !options.IgnoredPaths.Any(p => ctx.Request.Path.StartsWithSegments(p));
                    // O usuário só existe DEPOIS do middleware de autenticação: enriquecer na resposta, não na requisição.
                    o.EnrichWithHttpResponse = (activity, response) =>
                    {
                        var userId = ResolveUserId(response.HttpContext.User);
                        if (!string.IsNullOrEmpty(userId))
                            activity.SetTag("enduser.id", userId);
                    };
                })
                // <<< [WEB]
                .AddHttpClientInstrumentation(o => o.RecordException = true)
                .AddSqlClientInstrumentation(o => o.RecordException = true); // EF Core com outro provider: AddEntityFrameworkCoreInstrumentation()

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

        // Evita loop de auto-observação: o HttpClient dos exporters gera logs que voltariam ao pipeline.
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpTraceExporter", LogLevel.None);
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpMetricExporter", LogLevel.None);
        builder.Logging.AddFilter("System.Net.Http.HttpClient.OtlpLogExporter", LogLevel.None);

        return builder;
    }

    /// <summary>Normaliza para development | homolog | production. Desconhecido vai como está (aparece no SigNoz e é corrigido).</summary>
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

    // Identificador estável e opaco. NUNCA e-mail/CPF/nome (LGPD). Ajuste à ordem de claims do projeto.
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

```

## Apêndice E — templates/dotnet/TraceIdResponseExtensions.cs

`plugins/otel-signoz/templates/dotnet/TraceIdResponseExtensions.cs`

```csharp
// Template do plugin otel-signoz. Placeholder: __NAMESPACE__. Requer ASP.NET Core (.NET 7+ para ProblemDetailsOptions).
using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Trace;

namespace __NAMESPACE__.Observability;

public static class TraceIdResponseExtensions
{
    public const string HeaderName = "X-Trace-Id";
    public const string FieldName = "traceId"; // se o projeto já usa correlationId/requestId, siga a decisão da entrevista

    /// <summary>Trace ID W3C (32 hex) da requisição atual. Fallback: TraceIdentifier do ASP.NET Core.</summary>
    public static string GetTraceId(this HttpContext context) =>
        Activity.Current?.TraceId.ToHexString() ?? context.TraceIdentifier;

    /// <summary>
    /// Adiciona X-Trace-Id em TODA resposta — cobre retornos customizados em controllers, downloads (Blob)
    /// e erros de infraestrutura sem precisar editar cada ponto. Registre logo após UseRouting/antes dos endpoints
    /// (ou no topo do pipeline). Lembre de expor o header no CORS: WithExposedHeaders("X-Trace-Id").
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
    /// Garante traceId (32 hex, mesmo formato do header) em todo ProblemDetails — inclusive o 400 automático
    /// do [ApiController], que por padrão usa o formato W3C completo "00-traceid-spanid-01".
    /// Compõe com qualquer CustomizeProblemDetails já existente no projeto (não sobrescreve).
    /// Não chama AddProblemDetails(): se o projeto quiser ProblemDetails para exceções, ele mesmo registra.
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
    /// Para handlers/middlewares/filtros próprios: marca o span como erro, registra a exceção e devolve o Trace ID
    /// para ser incluído no corpo da resposta (envelope próprio ou ProblemDetails).
    /// </summary>
    public static string MarkErrorAndGetTraceId(this HttpContext context, Exception exception)
    {
        var activity = Activity.Current;
        if (activity is not null)
        {
            activity.SetStatus(ActivityStatusCode.Error, exception.GetType().Name);
            // Activity.AddException vem do System.Diagnostics.DiagnosticSource 9+ (transitivo dos pacotes OpenTelemetry atuais,
            // inclusive em net8). Pacotes OpenTelemetry antigos: use activity.RecordException(exception).
            activity.AddException(exception);
        }
        return context.GetTraceId();
    }
}

```

## Apêndice E — templates/dotnet/MessagingTracePropagation.cs

`plugins/otel-signoz/templates/dotnet/MessagingTracePropagation.cs`

```csharp
// Template do plugin otel-signoz. Placeholder: __NAMESPACE__.
// Use SOMENTE para brokers/jobs sem instrumentação nativa (RabbitMQ.Client 6.x, Kafka, Azure Storage Queues,
// fila em tabela SQL, jobs próprios). Service Bus, RabbitMQ.Client 7+, MassTransit e Hangfire têm caminho
// nativo — ver references/mensageria-workers.md.
using System.Diagnostics;
using System.Text;
using OpenTelemetry;
using OpenTelemetry.Context.Propagation;

namespace __NAMESPACE__.Observability;

public static class MessagingTracePropagation
{
    private static TextMapPropagator Propagator => Propagators.DefaultTextMapPropagator;

    /// <summary>
    /// Publicador: abre um span Producer e injeta traceparent/tracestate nos headers da mensagem.
    /// using var activity = MessagingTracePropagation.StartProducerActivity("pedidos", headers);
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
    /// Consumidor: extrai o contexto dos headers e abre um span Consumer filho do publicador — mesmo Trace ID
    /// da requisição que originou a mensagem. Envolva TODO o processamento no using.
    /// using var activity = MessagingTracePropagation.StartConsumerActivity("pedidos", message.Headers);
    /// </summary>
    public static Activity? StartConsumerActivity(string destination, IReadOnlyDictionary<string, object?>? headers, string system = "custom")
    {
        var parent = Propagator.Extract(default, headers, static (carrier, key) =>
        {
            if (carrier is null || !carrier.TryGetValue(key, out var value) || value is null)
                return Enumerable.Empty<string>();
            // RabbitMQ entrega headers como byte[].
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

    /// <summary>Consumidor: marca falha no span (a mensagem vai para retry/DLQ — o Trace ID permite achar a origem).</summary>
    public static void MarkFailed(this Activity? activity, Exception exception)
    {
        if (activity is null) return;
        activity.SetStatus(ActivityStatusCode.Error, exception.GetType().Name);
        // Activity.AddException vem do System.Diagnostics.DiagnosticSource 9+ (transitivo dos pacotes OpenTelemetry atuais,
        // inclusive em net8). Pacotes OpenTelemetry antigos: use activity.RecordException(exception).
        activity.AddException(exception);
    }
}

```

## Apêndice E — templates/dotnet/appsettings.Observability.snippet.jsonc

`plugins/otel-signoz/templates/dotnet/appsettings.Observability.snippet.jsonc`

```jsonc
// Mesclar nos appsettings do serviço. SEM IngestionKey aqui — ela vem de user-secrets (local)
// ou Key Vault / variável Observability__IngestionKey (deploy).
//
// appsettings.json (comum a todos os ambientes)
{
  "Observability": {
    "Endpoint": "https://ingest.__REGION__.signoz.cloud:443",
    "ServiceName": "__SERVICE_NAME__",
    "ServiceNamespace": "__SERVICE_NAMESPACE__",
    "SamplingRatio": 1.0
  }
}

// appsettings.Development.json
{ "Observability": { "Environment": "development" } }

// appsettings.Homolog.json (ou o nome de ambiente que o projeto usa para homologação)
{ "Observability": { "Environment": "homolog" } }

// appsettings.Production.json
{ "Observability": { "Environment": "production" } }

// Local (uma vez por máquina, na pasta do projeto):
//   dotnet user-secrets init
//   dotnet user-secrets set "Observability:IngestionKey" "<chave da conta SigNoz de dev>"

```

## Apêndice F — templates/angular/telemetry.service.ts

`plugins/otel-signoz/templates/angular/telemetry.service.ts`

```ts
// Template do plugin otel-signoz — Angular 15+ (ajuste para NgModule/class-based conforme references/angular-frontend.md).
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
// Angular com zone.js: usar o *peer-dep* (reaproveita o zone.js do app; o pacote "context-zone" traz um segundo zone.js).
// App zoneless: troque por `new StackContextManager()` de '@opentelemetry/sdk-trace-web'.
import { ZoneContextManager } from '@opentelemetry/context-zone-peer-dep';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { environment } from '../../environments/environment';

export type DeploymentEnvironment = 'development' | 'homolog' | 'production';

export interface ObservabilityConfig {
  enabled: boolean;
  /** Ex.: https://ingest.us.signoz.cloud:443 (sem /v1/...). */
  endpoint: string;
  /** Placeholder __SIGNOZ_INGESTION_KEY__ no repositório; valor real injetado pelo CI/CD. */
  ingestionKey: string;
  /** Idêntico em todos os ambientes — ambiente vai em deployment.environment. */
  serviceName: string;
  serviceNamespace?: string;
  /** Placeholder __APP_VERSION__ (vAAAAMMDD.HHMM) substituído pelo CI/CD. */
  serviceVersion?: string;
  environment: DeploymentEnvironment;
  /** URLs base da API e do AUTH PRÓPRIOS. Nunca domínios de terceiros (Microsoft, Graph, pagamentos). */
  propagateTo: string[];
  /** Spans de clique. Desligue se não houver uso (custo). */
  captureUserInteractions?: boolean;
}

const PLACEHOLDER = /^__.+__$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Casa a URL base exata e seus subcaminhos — "https://api.x.com" NÃO casa "https://api.x.com.evil.com". */
function baseUrlPattern(url: string): RegExp {
  return new RegExp(`^${escapeRegExp(url.replace(/\/+$/, ''))}([/?#]|$)`, 'i');
}

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private initialized = false;

  initialize(): void {
    const cfg = (environment as { observability?: ObservabilityConfig }).observability;
    if (!this.isBrowser || this.initialized || !cfg?.enabled || !cfg.ingestionKey || PLACEHOLDER.test(cfg.ingestionKey)) return;

    try {
      const endpoint = cfg.endpoint.replace(/\/+$/, '');
      const attributes: Record<string, string> = {
        'service.name': cfg.serviceName,
        'service.version': cfg.serviceVersion && !PLACEHOLDER.test(cfg.serviceVersion) ? cfg.serviceVersion : 'unknown',
        'deployment.environment': cfg.environment,      // filtros de ambiente do SigNoz
        'deployment.environment.name': cfg.environment, // convenção semântica atual do OTel
      };
      if (cfg.serviceNamespace) attributes['service.namespace'] = cfg.serviceNamespace;

      const exporter = new OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
        headers: { 'signoz-ingestion-key': cfg.ingestionKey },
      });

      const provider = new WebTracerProvider({
        resource: resourceFromAttributes(attributes),
        spanProcessors: [new BatchSpanProcessor(exporter)],
      });
      provider.register({ contextManager: new ZoneContextManager() });

      const propagateTraceHeaderCorsUrls = cfg.propagateTo.filter(Boolean).map(baseUrlPattern);
      const ignoreUrls = [baseUrlPattern(endpoint)]; // não instrumenta o envio da própria telemetria

      registerInstrumentations({
        instrumentations: [
          new DocumentLoadInstrumentation(),
          ...(cfg.captureUserInteractions === false ? [] : [new UserInteractionInstrumentation()]),
          new FetchInstrumentation({ propagateTraceHeaderCorsUrls, ignoreUrls, clearTimingResources: true }),
          new XMLHttpRequestInstrumentation({ propagateTraceHeaderCorsUrls, ignoreUrls, clearTimingResources: true }),
        ],
      });

      this.initialized = true;
    } catch (error) {
      // Telemetria nunca derruba o app.
      console.warn('[telemetria] falha ao inicializar', error);
    }
  }
}

```

## Apêndice F — templates/angular/trace-id.util.ts

`plugins/otel-signoz/templates/angular/trace-id.util.ts`

```ts
// Template do plugin otel-signoz — regra de exibição do Trace ID (decidida só no front).
import { HttpErrorResponse } from '@angular/common/http';

export const TRACE_ID_HEADER = 'X-Trace-Id';

/** Respostas esperadas do domínio: NÃO exibem Trace ID/suporte. Todo o resto é falha do sistema. */
export const EXPECTED_DOMAIN_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422, 429]);

const W3C_TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i;
const HEX_TRACE_ID = /^[\da-f]{32}$/i;
const FRAMEWORK_DEFAULT_MESSAGE = /^An error occurred/i; // title padrão do ProblemDetails 500 do ASP.NET Core

export interface ErrorDetails {
  status: number;
  message: string;
  /** Falha do sistema: exibir código + copiar + orientação de suporte. */
  isSystemFailure: boolean;
  /** Preenchido só em falha do sistema e quando o backend devolveu. */
  traceId?: string;
  /** ISO 8601 — permite buscar no SigNoz quando não há Trace ID (status 0). */
  occurredAt: string;
  /** Rota da API sem query string (evita levar PII para o texto copiado). */
  apiPath?: string;
}

export function isSystemFailure(status: number): boolean {
  // 0 (rede/timeout) e >= 500 já ficam fora do conjunto; explícito para leitura.
  return status === 0 || status >= 500 || !EXPECTED_DOMAIN_STATUSES.has(status);
}

/** Lê o Trace ID do corpo (traceId/traceID/trace_id) ou do header X-Trace-Id; normaliza o formato W3C completo. */
export function extractTraceId(error: HttpErrorResponse): string | undefined {
  const body = error.error as Record<string, unknown> | null | undefined;
  const fromBody = body && typeof body === 'object' ? (body['traceId'] ?? body['traceID'] ?? body['trace_id']) : undefined;
  const raw = (typeof fromBody === 'string' && fromBody) || error.headers?.get(TRACE_ID_HEADER) || undefined;
  if (!raw) return undefined;

  const w3c = W3C_TRACEPARENT.exec(raw);
  if (w3c) return w3c[1].toLowerCase();
  return HEX_TRACE_ID.test(raw) ? raw.toLowerCase() : raw;
}

function pickMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return typeof body === 'string' && body.length < 300 ? body : undefined;
  const b = body as Record<string, unknown>;
  // Ajuste à ordem de campos do envelope do projeto (ex.: "mensagem" primeiro).
  const candidate = b['mensagem'] ?? b['message'] ?? b['detail'] ?? b['title'];
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

function apiPathOf(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, globalThis.location?.origin ?? 'http://localhost').pathname;
  } catch {
    return undefined;
  }
}

export function toErrorDetails(
  error: HttpErrorResponse,
  fallbackMessage = 'Não foi possível concluir a operação.',
): ErrorDetails {
  const system = isSystemFailure(error.status);
  const serverMessage = pickMessage(error.error);

  let message: string;
  if (error.status === 0) {
    message = 'Não foi possível se comunicar com o servidor. Verifique sua conexão e tente novamente.';
  } else if (system) {
    // 5xx: usa a mensagem do backend (já mascarada pela política do projeto), exceto o texto padrão do framework.
    message = serverMessage && !FRAMEWORK_DEFAULT_MESSAGE.test(serverMessage)
      ? serverMessage
      : 'Ocorreu um erro inesperado ao processar sua solicitação.';
  } else {
    message = serverMessage ?? fallbackMessage;
  }

  return {
    status: error.status,
    message,
    isSystemFailure: system,
    traceId: system ? extractTraceId(error) : undefined,
    occurredAt: new Date().toISOString(),
    apiPath: apiPathOf(error.url),
  };
}

```

## Apêndice F — templates/angular/error.interceptor.ts

`plugins/otel-signoz/templates/angular/error.interceptor.ts`

```ts
// Template do plugin otel-signoz — interceptor funcional (Angular 15+).
// Se o projeto JÁ tem interceptor de erro, NÃO registre este: incorpore a lógica no existente.
import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ErrorNotificationService } from './error-notification.service';

/**
 * Para chamadas que tratam o erro localmente (evita notificação duplicada):
 *   this.http.get(url, { context: new HttpContext().set(SKIP_GLOBAL_ERROR_UI, true) })
 * e, no tratamento local, `this.errors.fromHttpError(err)` para manter o Trace ID.
 */
export const SKIP_GLOBAL_ERROR_UI = new HttpContextToken<boolean>(() => false);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const errors = inject(ErrorNotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      // 401 segue o fluxo de sessão/login já existente no projeto.
      if (error instanceof HttpErrorResponse && error.status !== 401 && !req.context.get(SKIP_GLOBAL_ERROR_UI)) {
        errors.fromHttpError(error);
      }
      return throwError(() => error);
    }),
  );
};

```

## Apêndice F — templates/angular/error-notification.service.ts

`plugins/otel-signoz/templates/angular/error-notification.service.ts`

```ts
// Template do plugin otel-signoz — implementação com SweetAlert2.
// Outra lib (ngx-toastr, MatSnackBar/MatDialog, PrimeNG): mantenha a API pública (fromHttpError/show)
// e troque só a renderização. Falha do sistema precisa de DIÁLOGO (botão copiar); toast basta para domínio.
import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import Swal from 'sweetalert2';
import { ErrorDetails, toErrorDetails } from './trace-id.util';
import { environment } from '../../environments/environment';

interface SupportConfig {
  /** E-mail do suporte/administrador (mailto com assunto e corpo preenchidos). */
  email?: string;
  /** URL para abrir chamado (Service Desk, Jira SM, etc.). */
  ticketUrl?: string;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value: string) => value.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

@Injectable({ providedIn: 'root' })
export class ErrorNotificationService {
  private readonly support: SupportConfig = (environment as { support?: SupportConfig }).support ?? {};
  private readonly observability = (environment as {
    observability?: { serviceName?: string; environment?: string; serviceVersion?: string };
  }).observability;

  fromHttpError(error: HttpErrorResponse): void {
    this.show(toErrorDetails(error));
  }

  show(details: ErrorDetails): void {
    if (!details.isSystemFailure) {
      void Swal.fire({ icon: 'warning', text: details.message });
      return;
    }

    const copyText = this.buildCopyText(details);
    void Swal.fire({
      icon: 'error',
      title: 'Ocorreu um erro',
      html: this.buildHtml(details, copyText),
      confirmButtonText: 'Copiar detalhes',
      showCancelButton: true,
      cancelButtonText: 'Fechar',
      // Copia sem fechar o diálogo (o usuário ainda pode clicar no link de suporte).
      preConfirm: async () => {
        const ok = await this.copy(copyText);
        const button = Swal.getConfirmButton();
        if (button) button.textContent = ok ? 'Copiado ✓' : 'Copie o código manualmente';
        return false;
      },
    });
  }

  private buildHtml(d: ErrorDetails, copyText: string): string {
    const code = d.traceId
      ? `<p style="margin:1rem 0 .25rem;font-size:.85rem;color:#757575">Código do erro (Trace ID)</p>
         <code style="display:block;padding:.5rem;border-radius:4px;background:rgba(0,0,0,.05);user-select:all;word-break:break-all">${esc(d.traceId)}</code>`
      : `<p style="margin:1rem 0 .25rem;font-size:.85rem;color:#757575">Ocorrido em ${esc(new Date(d.occurredAt).toLocaleString())}</p>`;

    const reference = d.traceId ? 'este código' : 'a data e o horário do erro';
    const links = [
      this.support.email
        ? `<a href="${esc(this.mailto(copyText))}">Enviar e-mail ao suporte</a>`
        : '',
      this.support.ticketUrl
        ? `<a href="${esc(this.support.ticketUrl)}" target="_blank" rel="noopener">Abrir chamado</a>`
        : '',
    ].filter(Boolean).join(' · ');

    return `<p>${esc(d.message)}</p>
      ${code}
      <p style="margin-top:1rem;font-size:.9rem">Se o problema persistir, entre em contato com o suporte ou com o
      administrador do sistema informando ${reference}.</p>
      ${links ? `<p style="font-size:.9rem">${links}</p>` : ''}`;
  }

  private buildCopyText(d: ErrorDetails): string {
    return [
      `Sistema: ${this.observability?.serviceName ?? document.title}`,
      `Mensagem: ${d.message}`,
      `Trace ID: ${d.traceId ?? 'não disponível'}`,
      `Data/hora: ${d.occurredAt}`,
      `Tela: ${location.pathname}`,
      d.apiPath ? `Rota da API: ${d.apiPath}` : '',
      `Status HTTP: ${d.status}`,
      this.observability?.environment ? `Ambiente: ${this.observability.environment}` : '',
      this.observability?.serviceVersion && !/^__.+__$/.test(this.observability.serviceVersion)
        ? `Versão: ${this.observability.serviceVersion}`
        : '',
    ].filter(Boolean).join('\n');
  }

  private mailto(copyText: string): string {
    const subject = encodeURIComponent(`Erro na aplicação ${this.observability?.serviceName ?? ''}`.trim());
    const body = encodeURIComponent(`${copyText}\n\n(Descreva o que estava fazendo e anexe um print desta tela.)`);
    return `mailto:${this.support.email}?subject=${subject}&body=${body}`;
  }

  /** navigator.clipboard exige contexto seguro (HTTPS); fallback para intranet em HTTP. */
  private async copy(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* cai no fallback */
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
}

```

## Apêndice F — templates/angular/environment.snippet.ts

`plugins/otel-signoz/templates/angular/environment.snippet.ts`

```ts
// Mesclar em CADA src/environments/environment*.ts (valores por ambiente). Placeholders __X__ são
// substituídos pelo CI/CD — nunca commitar chave real. Local: enabled=false (ou chave de dev fora do git).
export const environment = {
  // ...propriedades existentes (apiUrl etc.)...
  observability: {
    enabled: true,
    endpoint: 'https://ingest.__REGION__.signoz.cloud:443',
    ingestionKey: '__SIGNOZ_INGESTION_KEY__',
    serviceName: '__SERVICE_NAME__',          // ex.: intranet-ui — IGUAL em todos os ambientes
    serviceNamespace: '__SERVICE_NAMESPACE__', // ex.: intranet
    serviceVersion: '__APP_VERSION__',         // vAAAAMMDD.HHMM
    environment: 'production' as const,        // development | homolog | production
    propagateTo: ['https://api.exemplo.com.br', 'https://auth.exemplo.com.br'], // SÓ API/AUTH próprios
    captureUserInteractions: true,
  },
  support: {
    email: 'suporte@exemplo.com.br',
    ticketUrl: '',
  },
};

```
