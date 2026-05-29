# `fleetifydev/models` — Design (Phase 1)

**Date:** 2026-05-30
**Status:** Approved (brainstorm) → pending spec review → implementation
**Source spec:** `fleetifydev-models-implementation.md` (full schema/architecture reference)

This document records the decisions made during brainstorming and the concrete
seed manifest. For exhaustive schema/field tables and the distribution strategy,
defer to the source spec; this doc is the authoritative record of *what we are
building first and how*.

---

## 1. Summary

A TOML-based, config-only catalog of AI provider models. `providers/**/*.toml`
is the human/PR-editable source of truth; a build step flattens it into a
generated, machine-readable `dist/models.json` that the Fleetify app fetches at
runtime (via CDN) to populate its provider model pickers — so new models appear
without shipping an app release.

Modeled on `anomalyco/models.dev`, **minus the website / SST / packages web app**.
We keep only the TOML configs + a small build-to-JSON step + the generated
artifact the app consumes.

---

## 2. Scope

### In scope (this repo, Phase 1)
- `schema/` — JSON Schema for `provider.toml` and a model TOML.
- `providers/` — curated, current TOML for ~9 providers (see §6 manifest).
- `scripts/` — `build.ts`, `validate.ts`, and a shared `lib/` they both use.
- `dist/` — generated `models.json` + `index.json` + per-provider `providers/<id>.json`.
- CI — `validate.yml` (PR: validate + build, no commit) and `publish.yml`
  (main: build + commit `dist/`).
- `README.md`, `LICENSE` (MIT), `package.json`, `tsconfig.json`.
- Unit + end-to-end tests for the build pipeline (`bun test`).

### Out of scope (deferred / other repos)
- ❌ Phase 2 serving layer — lives in the separate `fleetify.dev/api` repo.
- ❌ Phase 3 scheduled sync (`scripts/sync/`, `sync.yml`) — not built now.
- ❌ No website / SST / frontend / runtime server in this repo.
- ❌ Logos / per-provider assets (Phase 3).

---

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | **Bun** (1.3.10, installed) | Matches spec's `bun run` scripts; fast TS exec. Scripts kept Node-runnable in principle. |
| TOML parser | **`smol-toml`** | Named in spec; supports TOML 1.0 incl. `1_000_000` underscores. |
| Validation | **JSON Schema + Ajv** | Schema files are themselves a publishable artifact PR authors/consumers can use; matches `schema/` layout. (Alt considered: Zod — rejected, no standalone schema artifact.) |
| Outputs | `models.json` **+** `index.json` **+** `providers/<id>.json` | Cheap to emit; enables lighter per-provider fetches (spec §5). Trivial to reduce to one file later. |
| License | **MIT** | Same as models.dev. |
| Testing | **TDD with `bun test`** | Pure lib functions are highly unit-testable; one e2e build over a fixture dir. |
| Seed strategy | **Curate a focused real set** | Clean, reviewable first commit; values grounded in models.dev/provider docs (not invented). Sync can expand later. |
| Dist commit | `publish.yml` commits `dist/` to `main` | Simplest CDN story (jsDelivr `@main`); tags give pinnable URLs. |

---

## 4. Repository layout (to be created)

```
fleetifydev/models/
├── README.md
├── LICENSE                         # MIT
├── package.json
├── tsconfig.json
├── schema/
│   ├── provider.schema.json
│   └── model.schema.json
├── providers/
│   ├── openai/{provider.toml, models/*.toml}
│   ├── anthropic/{provider.toml, models/*.toml}
│   ├── google/…  deepseek/…  xai/…  perplexity/…  mistral/…
│   ├── nvidia-nim/{provider.toml, models/meta/llama-4-maverick.toml}  # subfolder id
│   └── openrouter/{provider.toml, models/anthropic/claude-opus-4-8.toml}  # [extends]
├── scripts/
│   ├── build.ts                    # TOML → dist/* (validate + aggregate + stamp)
│   ├── validate.ts                 # validate only (no write) — PR check
│   └── lib/
│       ├── catalog.ts              # walk providers/, parse TOML, derive ids
│       ├── extends.ts              # resolve [extends] (merge + omit)
│       ├── defaults.ts             # apply [fleetify] defaults
│       ├── validate.ts             # Ajv compile + validate against schema/
│       └── emit.ts                 # build dist/ shapes
├── tests/
│   ├── fixtures/providers/…        # tiny catalog for e2e
│   └── *.test.ts
├── dist/                           # GENERATED (committed by CI)
│   ├── models.json
│   ├── index.json
│   └── providers/<id>.json
└── .github/workflows/
    ├── validate.yml
    └── publish.yml
```

- `id` of a model = its filename (no `id` field in TOML). `/`-containing ids use
  subfolders (e.g. `nvidia-nim/models/meta/llama-4-maverick.toml` → `meta/llama-4-maverick`).

---

## 5. Schema & build pipeline

Schema details (every field + type + default) live in the source spec §3–§4.
Top-level fields stay **models.dev-compatible**; Fleetify-only data lives under a
`[fleetify]` table. `[extends]` (`from = "<provider>/<model-id>"`, optional
`omit = [...]`) provides wrapper/mirror reuse.

**Pipeline (shared `lib/`, used by both `build.ts` and `validate.ts`):**
1. Walk `providers/**/provider.toml` + `providers/**/models/**/*.toml`.
2. Parse TOML; derive `id` from path relative to each provider's `models/`.
3. Resolve `[extends]` — look up `from`, deep-merge local over inherited, apply `omit`.
4. Ajv-validate every provider + model record against `schema/*.json`. Fail on error.
5. Apply Fleetify defaults: `label ?? name`, `supports_effort ?? reasoning`, etc.
6. (`build.ts` only) Emit `dist/models.json` (+ `index.json` + per-provider),
   stamped with `schemaVersion`, `generatedAt`, and the build `commit`.

`validate.ts` runs steps 1–4 only.

**`dist/models.json` shape:** `{ schemaVersion: 1, generatedAt, commit, providers: { <id>: { id, name, kind, doc, env, api, supports_live, models: [ { id, label, context, supports_effort, reasoning, tool_call, modalities, cost, group, note, endpoint, hidden, release_date, … } ] } } }`. Stable, additive, keyed by `schemaVersion`; `hidden: true` models stay in the catalog (so old sessions resolve labels) but the app filters them from the picker.

---

## 6. Initial seed manifest

~9 providers. Selection is fixed below; exact numeric values (context, cost,
dates, capability flags) will be grounded in models.dev / provider docs during
implementation rather than invented. Adjustable on review.

| Provider (dir) | Models | Demonstrates |
|---|---|---|
| `openai` | gpt-5.5, gpt-5.4, gpt-5.4-mini | cost/limit/modalities, `supports_effort` |
| `anthropic` | claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5 | reasoning, `cost.cache_read` |
| `google` | gemini-2.5-pro, gemini-2.5-flash | large context window |
| `deepseek` | deepseek-chat, deepseek-reasoner | `open_weights`, reasoning |
| `xai` | grok-4, grok-4-mini | `family` grouping |
| `perplexity` | sonar, sonar-pro, sonar-reasoning | `[fleetify].endpoint` override; curated (no live `/v1/models`), `supports_live=false` |
| `mistral` | mistral-large, codestral | `[fleetify].note` badge, `aliases` |
| `nvidia-nim` | meta/llama-4-maverick | **subfolder id containing `/`** |
| `openrouter` | anthropic/claude-opus-4-8 (mirror) | **`[extends]`** + `group="via OpenRouter"` |

Collectively exercises every schema feature: `cost`, `limit`, `modalities`, all
capability flags, every `[fleetify]` extra (`label`, `supports_effort`, `group`,
`note`, `endpoint`, `hidden`, `aliases`), `[extends]` (with `omit`), and `/`-ids.

---

## 7. CI workflows

- **`validate.yml`** (on PR): `bun install` → `bun run validate` → `bun run build`
  (build must succeed; **no commit**). Blocks merge on schema/TOML errors.
- **`publish.yml`** (on push to `main`): `bun run build` → commit `dist/` back to
  `main`. Release tags `vX.Y.Z` give pinnable CDN URLs
  (`cdn.jsdelivr.net/gh/fleetifydev/models@vX.Y.Z/dist/models.json`).

---

## 8. Testing approach (TDD)

Pure lib functions unit-tested first, then an end-to-end build:
- `deriveId(modelPath, providerModelsRoot)` — incl. nested `meta/llama-…`.
- `resolveExtends(record, catalog)` — merge precedence + `omit` removal; error on missing `from`.
- `applyFleetifyDefaults(model)` — `label ?? name`, `supports_effort ?? reasoning`.
- `validateRecord(record, schema)` — accepts valid, rejects each invalid shape.
- **e2e:** build over `tests/fixtures/providers/` → assert `dist` shape, `id`
  derivation, resolved `[extends]`, applied defaults, `schemaVersion`.

---

## 9. Versioning

- `schemaVersion` in `dist/models.json` — bump only on breaking shape changes;
  app ignores unknown fields (forward-compatible). Start at `1`.
- Git tags `vX.Y.Z` — let the app/API pin a known-good catalog version.
- Adding providers/models = data change (no version bump).

---

## 10. Phasing (recap)

1. **Phase 1 (this doc):** repo + schema + curated TOML + build/validate + CI + jsDelivr URL.
2. **Phase 2 (separate repo):** `fleetify.dev/api` serving layer + app resolution chain.
3. **Phase 3:** scheduled sync → automation PRs; logos; lighter per-provider fetches.
