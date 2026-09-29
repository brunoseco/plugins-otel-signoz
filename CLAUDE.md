# CLAUDE.md

Guidance for whoever maintains this repository. This file is **not** loaded by the plugin itself —
a `CLAUDE.md` at a plugin's root isn't loaded as context, and `claude plugin validate` warns when it
finds one there, so it deliberately doesn't exist under `plugins/otel-signoz/`.

## What this repository is

A Claude Code plugin marketplace (`brunoseco`) with a single plugin, `otel-signoz`, under
`plugins/otel-signoz/`. See the plugin's own [`README.md`](plugins/otel-signoz/README.md) for what it
does, and [`docs/origem/playbook-otel-signoz.md`](docs/origem/playbook-otel-signoz.md) for the source
runbook the plugin's rules are derived from.

## Editing conventions

- All plugin content (skill bodies, references, templates, docs, agent instructions, this file) is
  written in **English**. Code and identifiers follow their own language's conventions regardless.
  The two source documents under `docs/origem/` and this repo's `PROMPT.md` stay as originally
  written (Portuguese) — they're historical briefs, not generated plugin content.
- Keep each `SKILL.md` under 500 lines. Move detailed material into `references/` and link to it.
- `references/` and `templates/` are plain files read on demand via `${CLAUDE_PLUGIN_ROOT}/...` from
  skill and agent content — they aren't a manifest component, so nothing needs registering for them
  to be found.
- `references/00-principles.md` is the source of truth for the plugin's non-negotiable rules. Every
  other reference and skill must stay consistent with it; when they conflict, fix the other file.
- **Templates only change together with a green build** in `.github/workflows/validate.yml` (the
  .NET compile job and the Angular type-check job). Don't hand-edit a template without re-running
  that validation locally first.
- Don't invent an API, package, or option. Confirm it on NuGet/npm/the vendor's docs, or mark it
  explicitly as "to confirm" in the reference file.
- No `commands/` and no `bin/` — entry points are skills; a `bin/` directory would also make the
  plugin uninstallable from claude.ai/Cowork and org-wide distribution.

## Local testing

```bash
# Load the plugin from disk without publishing it
claude --plugin-dir ./plugins/otel-signoz

# Validate the manifest and the marketplace
claude plugin validate ./plugins/otel-signoz --strict
claude plugin validate . --strict
```

Test the plugin end to end against a throwaway sample project (a minimal .NET API + Angular app)
generated outside this repository, never against a real client repository.

## Versioning

- The plugin uses SemVer (`plugin.json` → `version`, e.g. `1.0.0`, `1.1.0`, `2.0.0` for a breaking
  change to a skill's behavior or a template's shape).
- Every release bumps `version` in `plugins/otel-signoz/.claude-plugin/plugin.json` and adds an entry
  to `plugins/otel-signoz/CHANGELOG.md` in the same commit.
- `marketplace.json`'s own `metadata.version` tracks the marketplace file itself, not the plugin —
  bump it only when the marketplace structure changes (e.g., a second plugin gets added).
