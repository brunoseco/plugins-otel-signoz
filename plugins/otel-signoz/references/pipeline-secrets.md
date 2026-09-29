# Pipeline and secrets

**Golden rule, regardless of stack:** propose the pipeline diff and ask before editing it. CI/CD is
governed separately from application code — never push a change to `.github/workflows/*` or an
equivalent pipeline file without the user reviewing it first.

## 1. Backend secret (the ingestion key)

- **Local development**: the language's own local-secret mechanism, kept out of version control
  (`dotnet user-secrets`, a `.env` file that's `.gitignore`d, etc.).
- **Azure Key Vault** (the default for a .NET App Service): either an App Service Key Vault reference
  (`@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/Observability--IngestionKey/)`
  as an app setting) or `AddAzureKeyVault` reading the same secret name
  (`Observability--IngestionKey` — .NET's configuration binder maps `--` to a nested key,
  `Observability:IngestionKey`).
- **A plain environment variable**, when the deploy target has no vault: `Observability__IngestionKey`
  (.NET's convention: `__` maps to the nested key `Observability:IngestionKey`). Another stack's
  equivalent nested-config convention applies the same way.
- **Service version**: usually not read from a file at all. Inject it at build time
  (`-p:InformationalVersion=$VERSION` for .NET) or at deploy time
  (`Observability__ServiceVersion`).

## 2. Frontend secret (the ingestion key)

The frontend's ingestion key is public by nature once bundled into the JS — it only writes, it can't
read anything back. The risk it needs guarding against isn't exposure, it's an unrevocable, shared key:

- Commit a **placeholder** (`__SIGNOZ_INGESTION_KEY__`) in the repository, never a real key.
- Substitute the real value **in the pipeline**, right before the production build — see §3.
- Use a **separate key per frontend and per environment** so one can be revoked or rotated without
  touching the backend's key or any other frontend's.

## 3. GitHub Actions (the plugin's own worked example)

- Store each real key as a secret scoped to a GitHub **Environment** (`homolog`, `production`), not a
  repository-wide secret — this lets a reviewer require approval before a production deploy reads it.
- Substitute the placeholders **before** the frontend build step (`ng build` or equivalent), so the
  compiled bundle already contains the real value:

  ```yaml
  - name: Inject observability configuration
    run: |
      sed -i "s/__SIGNOZ_INGESTION_KEY__/${{ secrets.SIGNOZ_INGESTION_KEY }}/" src/environments/environment.prod.ts
      sed -i "s/__APP_VERSION__/${{ env.APP_VERSION }}/" src/environments/environment.prod.ts
  - name: Build
    run: npx ng build --configuration production
  ```
- **Never echo a secret to a log line** — a `sed` substitution is silent by default; keep it that way
  (don't add a `cat` of the file afterward in CI output).
- A different pipeline tool (Azure Pipelines, GitLab CI) follows the same shape: a masked/protected
  variable, substituted right before the frontend build.

## 4. Build-once vs. per-environment configuration (frontend)

Two valid strategies — match whatever the target project already does, don't introduce a second one:

- **Build-once, configure-at-runtime**: one build artifact, promoted unchanged across environments; the
  observability block (and the rest of the environment-specific config) lives in a runtime file
  (`assets/config.json`, `env.js`) fetched at startup. Substitute the placeholders in that runtime
  file per environment, not in the compiled JS bundle.
- **Build-per-environment**: Angular's own `fileReplacements`/`environment.*.ts` mechanism, one build
  per target environment, each with its own compiled-in values. Substitute the placeholders in the
  matching `environment.<env>.ts` before that environment's build step.

## 5. Rotation

- Rotating a frontend ingestion key only requires updating the pipeline secret and redeploying — no
  application code changes, since the key is only ever read from configuration.
- Rotating a backend ingestion key follows whatever secret-rotation process the target project (or
  its Key Vault) already has; this plugin doesn't automate rotation.
