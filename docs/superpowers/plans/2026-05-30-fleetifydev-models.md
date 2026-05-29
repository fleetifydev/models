# fleetifydev/models — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TOML-based catalog of AI provider models that compiles to a generated `dist/models.json` the Fleetify app fetches at runtime.

**Architecture:** `providers/**/*.toml` is the source of truth. A Bun + TypeScript pipeline (`scripts/lib/`) walks the TOML, derives each model `id` from its filename, resolves `[extends]` mirrors, validates every record against JSON Schema (Ajv), applies Fleetify picker defaults, and emits `dist/models.json` (+ `index.json` + per-provider files). Two thin scripts (`build.ts`, `validate.ts`) wrap the library; two CI workflows validate PRs and commit `dist/` on `main`.

**Tech Stack:** Bun 1.3, TypeScript, `smol-toml` (TOML parsing), `ajv` (JSON Schema validation), `bun test`.

---

## Conventions & prerequisites (read first)

- **Run everything from the repo root:** `C:\Users\loseu\Desktop\fleetify-models`.
- **Greenfield bootstrap:** the repo has zero commits. Execute Phase 1 directly on `main` — git worktrees are not applicable until an initial commit exists.
- **TOML has no `null`.** The source spec writes `group = null` illustratively; in real `.toml` files you **omit** optional fields instead. The picker mapping defaults absent fields to `null` in the JSON output.
- **Model `id` = filename** relative to the provider's `models/` dir (no `id` field in TOML). Subfolders encode `/`-ids (e.g. `nvidia-nim/models/meta/llama-4-maverick.toml` → `meta/llama-4-maverick`).
- **Commit trailer:** every `git commit` below must include the repo trailer. The first commit shows it in full; for later steps append the same trailer:

  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **TS import extensions:** imports use explicit `.ts` extensions (Bun resolves them; `tsconfig` enables `allowImportingTsExtensions`).
- **Numeric model data (cost/context/dates) is best-effort in this plan and MUST be verified** against models.dev `api.json` and provider docs in **Task 22** before the final build.

---

## File structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `.gitignore` | Tooling, deps, scripts |
| `schema/provider.schema.json` | JSON Schema for `provider.toml` |
| `schema/model.schema.json` | JSON Schema for a (resolved) model |
| `scripts/lib/types.ts` | All shared TypeScript types |
| `scripts/lib/derive-id.ts` | `deriveId()` — path → model id |
| `scripts/lib/load.ts` | `loadCatalog()` — walk FS, parse TOML |
| `scripts/lib/extends.ts` | `resolveExtends()` — merge + omit |
| `scripts/lib/defaults.ts` | `toPickerModel()`, `toPickerProvider()` — Fleetify defaults + flatten |
| `scripts/lib/validate.ts` | `createValidators()` — Ajv compile/validate |
| `scripts/lib/emit.ts` | `buildDist()` — assemble dist shapes |
| `scripts/lib/pipeline.ts` | `runPipeline()` — load→resolve→validate→default |
| `scripts/build.ts` | CLI: pipeline + emit + write `dist/` |
| `scripts/validate.ts` | CLI: pipeline only (no write) |
| `tests/*.test.ts`, `tests/fixtures/` | Unit + e2e tests |
| `providers/**` | Seed catalog data |
| `.github/workflows/{validate,publish}.yml` | CI |
| `README.md`, `LICENSE` | Docs + MIT license |

---

## Task 1: Project scaffolding (package.json, tsconfig, .gitignore) + first commit

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@fleetifydev/models",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "description": "TOML-based catalog of AI provider models, built to dist/models.json for the Fleetify app.",
  "scripts": {
    "build": "bun run scripts/build.ts",
    "validate": "bun run scripts/validate.ts",
    "test": "bun test"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "smol-toml": "^1.3.1"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "types": ["@types/bun"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
*.log
.DS_Store
Thumbs.db
```

(Note: `dist/` is intentionally NOT ignored — it is a committed artifact.)

- [ ] **Step 4: Install dependencies**

Run: `bun install`
Expected: creates `node_modules/` and `bun.lock`; exits 0.

- [ ] **Step 5: Verify the test runner works (no tests yet)**

Run: `bun test`
Expected: exits 0 with "0 tests" (or "no tests found"). Not an error.

- [ ] **Step 6: Commit (includes the already-written design doc)**

```bash
git add package.json tsconfig.json .gitignore bun.lock docs/
git commit -m "chore: scaffold project (bun, ts, deps) + design doc

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: JSON Schemas (provider + model)

**Files:**
- Create: `schema/provider.schema.json`
- Create: `schema/model.schema.json`

- [ ] **Step 1: Create `schema/provider.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://models.fleetify.dev/schema/provider.schema.json",
  "title": "Provider",
  "type": "object",
  "additionalProperties": false,
  "required": ["name"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "env": { "type": "array", "items": { "type": "string" } },
    "doc": { "type": "string", "pattern": "^https?://" },
    "api": { "type": "string", "pattern": "^https?://" },
    "fleetify": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "kind": { "enum": ["api", "local_http", "cli"] },
        "catalog_id": { "type": "string", "minLength": 1 },
        "models_endpoint": { "type": "string" },
        "supports_live": { "type": "boolean" }
      }
    }
  }
}
```

- [ ] **Step 2: Create `schema/model.schema.json`** (validates the RESOLVED model — `[extends]` is removed before validation, so it is not a property here)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://models.fleetify.dev/schema/model.schema.json",
  "title": "Model",
  "type": "object",
  "additionalProperties": false,
  "required": ["name"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "family": { "type": "string" },
    "release_date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "last_updated": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "knowledge": { "type": "string", "pattern": "^\\d{4}-\\d{2}$" },
    "attachment": { "type": "boolean" },
    "reasoning": { "type": "boolean" },
    "tool_call": { "type": "boolean" },
    "structured_output": { "type": "boolean" },
    "temperature": { "type": "boolean" },
    "open_weights": { "type": "boolean" },
    "cost": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "input": { "type": "number", "minimum": 0 },
        "output": { "type": "number", "minimum": 0 },
        "cache_read": { "type": "number", "minimum": 0 },
        "cache_write": { "type": "number", "minimum": 0 }
      }
    },
    "limit": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "context": { "type": "integer", "minimum": 0 },
        "output": { "type": "integer", "minimum": 0 }
      }
    },
    "modalities": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "input": { "type": "array", "items": { "type": "string" } },
        "output": { "type": "array", "items": { "type": "string" } }
      }
    },
    "fleetify": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "label": { "type": "string" },
        "supports_effort": { "type": "boolean" },
        "group": { "type": "string" },
        "note": { "type": "string" },
        "endpoint": { "type": "string" },
        "hidden": { "type": "boolean" },
        "aliases": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add schema/
git commit -m "feat: add provider + model JSON schemas"
```
(Append the co-author trailer.)

---

## Task 3: Shared types

**Files:**
- Create: `scripts/lib/types.ts`

- [ ] **Step 1: Create `scripts/lib/types.ts`**

```ts
// ── Raw TOML shapes (as parsed) ──────────────────────────────────────────
export interface FleetifyProviderExtras {
  kind?: "api" | "local_http" | "cli";
  catalog_id?: string;
  models_endpoint?: string;
  supports_live?: boolean;
}

export interface ProviderToml {
  name: string;
  env?: string[];
  doc?: string;
  api?: string;
  fleetify?: FleetifyProviderExtras;
}

export interface CostToml {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

export interface LimitToml {
  context?: number;
  output?: number;
}

export interface ModalitiesToml {
  input?: string[];
  output?: string[];
}

export interface FleetifyModelExtras {
  label?: string;
  supports_effort?: boolean;
  group?: string;
  note?: string;
  endpoint?: string;
  hidden?: boolean;
  aliases?: string[];
}

export interface ExtendsToml {
  from: string; // "<provider>/<model-id>"
  omit?: string[];
}

export interface ModelToml {
  name?: string; // required EXCEPT when [extends] supplies it (enforced post-resolution)
  family?: string;
  release_date?: string;
  last_updated?: string;
  knowledge?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  open_weights?: boolean;
  cost?: CostToml;
  limit?: LimitToml;
  modalities?: ModalitiesToml;
  fleetify?: FleetifyModelExtras;
  extends?: ExtendsToml;
}

// ── Loaded catalog (pre-resolution) ──────────────────────────────────────
export interface RawModelEntry {
  id: string; // derived from path
  providerId: string; // provider dir name
  data: ModelToml;
}

export interface RawProviderEntry {
  id: string; // provider dir name
  data: ProviderToml;
  models: RawModelEntry[];
}

export interface RawCatalog {
  providers: RawProviderEntry[];
}

// ── Output (dist) shapes ─────────────────────────────────────────────────
export interface PickerModel {
  id: string;
  label: string;
  family: string | null;
  context: number | null;
  output_limit: number | null;
  reasoning: boolean;
  supports_effort: boolean;
  tool_call: boolean;
  attachment: boolean;
  structured_output: boolean;
  temperature: boolean;
  open_weights: boolean;
  modalities: { input: string[]; output: string[] };
  cost: CostToml | null;
  group: string | null;
  note: string | null;
  endpoint: string | null;
  hidden: boolean;
  aliases: string[];
  release_date: string | null;
  last_updated: string | null;
  knowledge: string | null;
}

export interface PickerProvider {
  id: string;
  name: string;
  kind: "api" | "local_http" | "cli";
  doc: string | null;
  env: string[];
  api: string | null;
  models_endpoint: string | null;
  supports_live: boolean;
  models: PickerModel[];
}

export interface BuildMeta {
  generatedAt: string;
  commit: string;
}

export interface ModelsJson extends BuildMeta {
  schemaVersion: 1;
  providers: Record<string, PickerProvider>;
}

export interface IndexJson extends BuildMeta {
  schemaVersion: 1;
  providers: Array<{ id: string; name: string; kind: string; modelCount: number }>;
}

export interface ProviderFileJson extends BuildMeta {
  schemaVersion: 1;
  provider: PickerProvider;
}

export interface DistOutput {
  models: ModelsJson;
  index: IndexJson;
  perProvider: Record<string, ProviderFileJson>;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/types.ts
git commit -m "feat: add shared catalog types"
```

---

## Task 4: `deriveId` (path → model id)

**Files:**
- Create: `scripts/lib/derive-id.ts`
- Test: `tests/derive-id.test.ts`

- [ ] **Step 1: Write the failing test — `tests/derive-id.test.ts`**

```ts
import { test, expect } from "bun:test";
import { deriveId } from "../scripts/lib/derive-id.ts";

test("derives id from a flat filename", () => {
  expect(deriveId("/x/providers/openai/models/gpt-5.5.toml", "/x/providers/openai/models")).toBe("gpt-5.5");
});

test("derives a slash id from a subfolder", () => {
  expect(
    deriveId("/x/providers/nvidia-nim/models/meta/llama-4-maverick.toml", "/x/providers/nvidia-nim/models"),
  ).toBe("meta/llama-4-maverick");
});

test("normalizes Windows backslash separators", () => {
  expect(deriveId("C:\\p\\models\\meta\\llama.toml", "C:\\p\\models")).toBe("meta/llama");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/derive-id.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/derive-id.ts`.

- [ ] **Step 3: Create `scripts/lib/derive-id.ts`**

```ts
import { relative } from "node:path";

/** Model id = path relative to the provider's models/ root, sans .toml, POSIX-separated. */
export function deriveId(modelPath: string, modelsRoot: string): string {
  const rel = relative(modelsRoot, modelPath);
  return rel.replace(/\.toml$/i, "").split(/[\\/]/).join("/");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/derive-id.test.ts`
Expected: PASS — 3 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/derive-id.ts tests/derive-id.test.ts
git commit -m "feat: derive model id from file path"
```

---

## Task 5: Test fixtures (tiny catalog)

**Files:**
- Create: `tests/fixtures/providers/acme/provider.toml`
- Create: `tests/fixtures/providers/acme/models/base.toml`
- Create: `tests/fixtures/providers/acme/models/nested/mini.toml`
- Create: `tests/fixtures/providers/wrap/provider.toml`
- Create: `tests/fixtures/providers/wrap/models/acme/base.toml`

- [ ] **Step 1: `tests/fixtures/providers/acme/provider.toml`**

```toml
name = "Acme"
env = ["ACME_API_KEY"]
api = "https://api.acme.test/v1"
doc = "https://acme.test/docs"

[fleetify]
kind = "api"
supports_live = true
```

- [ ] **Step 2: `tests/fixtures/providers/acme/models/base.toml`**

```toml
name = "Acme Base"
family = "acme"
reasoning = true
tool_call = true

[cost]
input = 1.0
output = 2.0

[limit]
context = 100000
output = 8000

[modalities]
input = ["text", "image"]
output = ["text"]
```

- [ ] **Step 3: `tests/fixtures/providers/acme/models/nested/mini.toml`**

```toml
name = "Acme Mini"
```

- [ ] **Step 4: `tests/fixtures/providers/wrap/provider.toml`**

```toml
name = "Wrap"
env = ["WRAP_API_KEY"]
api = "https://api.wrap.test/v1"

[fleetify]
kind = "api"
```

- [ ] **Step 5: `tests/fixtures/providers/wrap/models/acme/base.toml`** (mirror that extends acme/base, drops cost)

```toml
[extends]
from = "acme/base"
omit = ["cost"]

[fleetify]
group = "via Wrap"
```

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/
git commit -m "test: add catalog fixtures"
```

---

## Task 6: `loadCatalog` (walk FS, parse TOML)

**Files:**
- Create: `scripts/lib/load.ts`
- Test: `tests/load.test.ts`

- [ ] **Step 1: Write the failing test — `tests/load.test.ts`**

```ts
import { test, expect } from "bun:test";
import { join } from "node:path";
import { loadCatalog } from "../scripts/lib/load.ts";

const PROVIDERS = join(import.meta.dir, "fixtures", "providers");

test("loads providers sorted by id with parsed data", () => {
  const cat = loadCatalog(PROVIDERS);
  expect(cat.providers.map((p) => p.id)).toEqual(["acme", "wrap"]);
  expect(cat.providers[0].data.name).toBe("Acme");
});

test("derives nested model ids and sorts models", () => {
  const cat = loadCatalog(PROVIDERS);
  const acme = cat.providers.find((p) => p.id === "acme")!;
  expect(acme.models.map((m) => m.id)).toEqual(["base", "nested/mini"]);
});

test("parses extends blocks", () => {
  const cat = loadCatalog(PROVIDERS);
  const wrap = cat.providers.find((p) => p.id === "wrap")!;
  expect(wrap.models[0].id).toBe("acme/base");
  expect(wrap.models[0].data.extends?.from).toBe("acme/base");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/load.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/load.ts`.

- [ ] **Step 3: Create `scripts/lib/load.ts`**

```ts
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { deriveId } from "./derive-id.ts";
import type { RawCatalog, RawProviderEntry, RawModelEntry, ProviderToml, ModelToml } from "./types.ts";

function walkToml(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkToml(full));
    else if (name.endsWith(".toml")) out.push(full);
  }
  return out;
}

/** Walk providers/, parse every provider.toml and models/**/*.toml, derive ids. */
export function loadCatalog(providersDir: string): RawCatalog {
  const providers: RawProviderEntry[] = [];
  for (const providerId of readdirSync(providersDir)) {
    const providerDir = join(providersDir, providerId);
    if (!statSync(providerDir).isDirectory()) continue;

    const providerTomlPath = join(providerDir, "provider.toml");
    if (!existsSync(providerTomlPath)) {
      throw new Error(`Missing provider.toml in ${providerDir}`);
    }
    const data = parseToml(readFileSync(providerTomlPath, "utf8")) as ProviderToml;

    const modelsRoot = join(providerDir, "models");
    const models: RawModelEntry[] = [];
    if (existsSync(modelsRoot)) {
      for (const file of walkToml(modelsRoot)) {
        const id = deriveId(file, modelsRoot);
        const mdata = parseToml(readFileSync(file, "utf8")) as ModelToml;
        models.push({ id, providerId, data: mdata });
      }
    }
    models.sort((a, b) => a.id.localeCompare(b.id));
    providers.push({ id: providerId, data, models });
  }
  providers.sort((a, b) => a.id.localeCompare(b.id));
  return { providers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/load.test.ts`
Expected: PASS — 3 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/load.ts tests/load.test.ts
git commit -m "feat: load + parse provider/model TOML"
```

---

## Task 7: `resolveExtends` (merge + omit)

**Files:**
- Create: `scripts/lib/extends.ts`
- Test: `tests/extends.test.ts`

- [ ] **Step 1: Write the failing test — `tests/extends.test.ts`**

```ts
import { test, expect } from "bun:test";
import { resolveExtends } from "../scripts/lib/extends.ts";
import type { RawModelEntry } from "../scripts/lib/types.ts";

function makeLookup(entries: RawModelEntry[]): Map<string, RawModelEntry> {
  return new Map(entries.map((e) => [`${e.providerId}/${e.id}`, e]));
}

const base: RawModelEntry = {
  id: "base",
  providerId: "acme",
  data: { name: "Acme Base", reasoning: true, cost: { input: 1, output: 2 }, fleetify: { hidden: false } },
};

test("returns data unchanged when there is no extends", () => {
  const lookup = makeLookup([base]);
  expect(resolveExtends(base, lookup)).toEqual(base.data);
});

test("merges parent fields, applies local overrides and omit", () => {
  const child: RawModelEntry = {
    id: "acme/base",
    providerId: "wrap",
    data: { extends: { from: "acme/base", omit: ["cost"] }, fleetify: { group: "via Wrap" } },
  };
  const lookup = makeLookup([base, child]);
  const merged = resolveExtends(child, lookup);
  expect(merged.name).toBe("Acme Base"); // inherited
  expect(merged.reasoning).toBe(true); // inherited
  expect(merged.cost).toBeUndefined(); // omitted
  expect(merged.fleetify).toEqual({ hidden: false, group: "via Wrap" }); // deep-merged
  expect(merged.extends).toBeUndefined(); // stripped
});

test("throws on unknown from", () => {
  const child: RawModelEntry = { id: "x", providerId: "wrap", data: { extends: { from: "nope/x" } } };
  expect(() => resolveExtends(child, makeLookup([child]))).toThrow(/unknown model/);
});

test("throws on a cycle", () => {
  const a: RawModelEntry = { id: "a", providerId: "p", data: { extends: { from: "p/b" } } };
  const b: RawModelEntry = { id: "b", providerId: "p", data: { extends: { from: "p/a" } } };
  expect(() => resolveExtends(a, makeLookup([a, b]))).toThrow(/cycle/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/extends.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/extends.ts`.

- [ ] **Step 3: Create `scripts/lib/extends.ts`**

```ts
import type { ModelToml, RawModelEntry } from "./types.ts";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: T): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

/** Resolve a model's [extends]: deep-merge parent under local overrides, then drop omit fields. */
export function resolveExtends(
  entry: RawModelEntry,
  lookup: Map<string, RawModelEntry>,
  seen: Set<string> = new Set(),
): ModelToml {
  const ext = entry.data.extends;
  if (!ext) return structuredClone(entry.data);

  const selfKey = `${entry.providerId}/${entry.id}`;
  if (seen.has(selfKey)) throw new Error(`extends: cycle detected at "${selfKey}"`);
  seen.add(selfKey);

  const parent = lookup.get(ext.from);
  if (!parent) throw new Error(`extends: ${selfKey} references unknown model "${ext.from}"`);

  const parentData = resolveExtends(parent, lookup, seen);
  const merged = deepMerge(structuredClone(parentData), structuredClone(entry.data));
  delete merged.extends;
  for (const key of ext.omit ?? []) delete (merged as Record<string, unknown>)[key];
  return merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/extends.test.ts`
Expected: PASS — 4 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/extends.ts tests/extends.test.ts
git commit -m "feat: resolve [extends] mirrors (merge + omit)"
```

---

## Task 8: `toPickerModel` / `toPickerProvider` (Fleetify defaults + flatten)

**Files:**
- Create: `scripts/lib/defaults.ts`
- Test: `tests/defaults.test.ts`

- [ ] **Step 1: Write the failing test — `tests/defaults.test.ts`**

```ts
import { test, expect } from "bun:test";
import { toPickerModel, toPickerProvider } from "../scripts/lib/defaults.ts";
import type { RawProviderEntry } from "../scripts/lib/types.ts";

test("label falls back to name; supports_effort falls back to reasoning", () => {
  const m = toPickerModel("gpt-x", { name: "GPT X", reasoning: true });
  expect(m.label).toBe("GPT X");
  expect(m.supports_effort).toBe(true);
});

test("explicit fleetify values win; absent optionals become null/defaults", () => {
  const m = toPickerModel("m", {
    name: "M",
    reasoning: false,
    fleetify: { label: "Custom", supports_effort: true, group: "G" },
  });
  expect(m.label).toBe("Custom");
  expect(m.supports_effort).toBe(true);
  expect(m.group).toBe("G");
  expect(m.note).toBeNull();
  expect(m.cost).toBeNull();
  expect(m.modalities).toEqual({ input: ["text"], output: ["text"] });
  expect(m.aliases).toEqual([]);
});

test("flattens limit and keeps cost/modalities", () => {
  const m = toPickerModel("m", {
    name: "M",
    limit: { context: 1000000, output: 32000 },
    cost: { input: 1.25, output: 10 },
    modalities: { input: ["text", "image"], output: ["text"] },
  });
  expect(m.context).toBe(1000000);
  expect(m.output_limit).toBe(32000);
  expect(m.cost).toEqual({ input: 1.25, output: 10 });
});

test("provider mapping applies kind default and catalog_id override", () => {
  const entry: RawProviderEntry = {
    id: "openai",
    data: { name: "OpenAI", env: ["OPENAI_API_KEY"], api: "https://api.openai.com/v1" },
    models: [],
  };
  const p = toPickerProvider(entry, []);
  expect(p.id).toBe("openai");
  expect(p.kind).toBe("api");
  expect(p.supports_live).toBe(false);
  expect(p.doc).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/defaults.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/defaults.ts`.

- [ ] **Step 3: Create `scripts/lib/defaults.ts`**

```ts
import type { ModelToml, PickerModel, PickerProvider, RawProviderEntry } from "./types.ts";

/** Apply Fleetify picker defaults and flatten a resolved model into the dist shape. */
export function toPickerModel(id: string, m: ModelToml): PickerModel {
  const f = m.fleetify ?? {};
  const reasoning = m.reasoning ?? false;
  return {
    id,
    label: f.label ?? m.name ?? id,
    family: m.family ?? null,
    context: m.limit?.context ?? null,
    output_limit: m.limit?.output ?? null,
    reasoning,
    supports_effort: f.supports_effort ?? reasoning,
    tool_call: m.tool_call ?? false,
    attachment: m.attachment ?? false,
    structured_output: m.structured_output ?? false,
    temperature: m.temperature ?? true,
    open_weights: m.open_weights ?? false,
    modalities: {
      input: m.modalities?.input ?? ["text"],
      output: m.modalities?.output ?? ["text"],
    },
    cost: m.cost ?? null,
    group: f.group ?? null,
    note: f.note ?? null,
    endpoint: f.endpoint ?? null,
    hidden: f.hidden ?? false,
    aliases: f.aliases ?? [],
    release_date: m.release_date ?? null,
    last_updated: m.last_updated ?? null,
    knowledge: m.knowledge ?? null,
  };
}

/** Map a provider entry + its picker models into the dist provider shape. */
export function toPickerProvider(p: RawProviderEntry, models: PickerModel[]): PickerProvider {
  const f = p.data.fleetify ?? {};
  return {
    id: f.catalog_id ?? p.id,
    name: p.data.name,
    kind: f.kind ?? "api",
    doc: p.data.doc ?? null,
    env: p.data.env ?? [],
    api: p.data.api ?? null,
    models_endpoint: f.models_endpoint ?? null,
    supports_live: f.supports_live ?? false,
    models,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/defaults.test.ts`
Expected: PASS — 4 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/defaults.ts tests/defaults.test.ts
git commit -m "feat: apply Fleetify defaults + map to picker shape"
```

---

## Task 9: `createValidators` (Ajv)

**Files:**
- Create: `scripts/lib/validate.ts`
- Test: `tests/validate.test.ts`

- [ ] **Step 1: Write the failing test — `tests/validate.test.ts`**

```ts
import { test, expect } from "bun:test";
import { join } from "node:path";
import { createValidators } from "../scripts/lib/validate.ts";

const SCHEMA = join(import.meta.dir, "..", "schema");

test("accepts a valid model and provider", () => {
  const v = createValidators(SCHEMA);
  expect(v.validateModel({ name: "GPT", limit: { context: 1000 } })).toEqual([]);
  expect(v.validateProvider({ name: "OpenAI", env: ["OPENAI_API_KEY"] })).toEqual([]);
});

test("rejects a model missing name", () => {
  const v = createValidators(SCHEMA);
  expect(v.validateModel({ reasoning: true }).length).toBeGreaterThan(0);
});

test("rejects unknown fields (additionalProperties:false)", () => {
  const v = createValidators(SCHEMA);
  expect(v.validateModel({ name: "X", bogus: 1 }).length).toBeGreaterThan(0);
});

test("rejects a bad release_date format", () => {
  const v = createValidators(SCHEMA);
  expect(v.validateModel({ name: "X", release_date: "Feb 2026" }).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/validate.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/validate.ts`.

- [ ] **Step 3: Create `scripts/lib/validate.ts`**

```ts
import Ajv, { type ErrorObject } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Validators {
  validateProvider: (data: unknown) => string[];
  validateModel: (data: unknown) => string[];
}

function fmt(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
}

/** Compile the provider + model JSON schemas; return validators returning error strings ([] = ok). */
export function createValidators(schemaDir: string): Validators {
  const ajv = new Ajv({ allErrors: true });
  const providerSchema = JSON.parse(readFileSync(join(schemaDir, "provider.schema.json"), "utf8"));
  const modelSchema = JSON.parse(readFileSync(join(schemaDir, "model.schema.json"), "utf8"));
  const vp = ajv.compile(providerSchema);
  const vm = ajv.compile(modelSchema);
  return {
    validateProvider: (d) => (vp(d) ? [] : fmt(vp.errors)),
    validateModel: (d) => (vm(d) ? [] : fmt(vm.errors)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/validate.test.ts`
Expected: PASS — 4 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/validate.ts tests/validate.test.ts
git commit -m "feat: Ajv schema validators"
```

---

## Task 10: `runPipeline` (load → resolve → validate → default)

**Files:**
- Create: `scripts/lib/pipeline.ts`
- Test: `tests/pipeline.test.ts`

- [ ] **Step 1: Write the failing test — `tests/pipeline.test.ts`**

```ts
import { test, expect } from "bun:test";
import { join } from "node:path";
import { runPipeline } from "../scripts/lib/pipeline.ts";

const OPTS = {
  providersDir: join(import.meta.dir, "fixtures", "providers"),
  schemaDir: join(import.meta.dir, "..", "schema"),
};

test("produces providers + models with resolved extends and defaults", () => {
  const providers = runPipeline(OPTS);
  expect(providers.map((p) => p.id)).toEqual(["acme", "wrap"]);

  const acme = providers.find((p) => p.id === "acme")!;
  expect(acme.models.map((m) => m.id)).toEqual(["base", "nested/mini"]);
  const acmeBase = acme.models.find((m) => m.id === "base")!;
  expect(acmeBase.supports_effort).toBe(true); // reasoning -> supports_effort
  expect(acmeBase.context).toBe(100000);

  const wrapModel = providers.find((p) => p.id === "wrap")!.models[0];
  expect(wrapModel.id).toBe("acme/base");
  expect(wrapModel.label).toBe("Acme Base"); // inherited name
  expect(wrapModel.cost).toBeNull(); // omitted
  expect(wrapModel.group).toBe("via Wrap");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pipeline.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/pipeline.ts`.

- [ ] **Step 3: Create `scripts/lib/pipeline.ts`**

```ts
import { loadCatalog } from "./load.ts";
import { resolveExtends } from "./extends.ts";
import { createValidators } from "./validate.ts";
import { toPickerModel, toPickerProvider } from "./defaults.ts";
import type { PickerModel, PickerProvider, RawModelEntry } from "./types.ts";

export interface PipelineOptions {
  providersDir: string;
  schemaDir: string;
}

/** Load, resolve extends, validate, and apply defaults. Throws an aggregated error on any failure. */
export function runPipeline(opts: PipelineOptions): PickerProvider[] {
  const catalog = loadCatalog(opts.providersDir);
  const validators = createValidators(opts.schemaDir);

  const lookup = new Map<string, RawModelEntry>();
  for (const p of catalog.providers) {
    for (const m of p.models) lookup.set(`${p.id}/${m.id}`, m);
  }

  const errors: string[] = [];
  const pickerProviders: PickerProvider[] = [];

  for (const p of catalog.providers) {
    for (const e of validators.validateProvider(p.data)) errors.push(`[provider ${p.id}] ${e}`);

    const pickerModels: PickerModel[] = [];
    for (const m of p.models) {
      let resolved;
      try {
        resolved = resolveExtends(m, lookup);
      } catch (err) {
        errors.push(`[model ${p.id}/${m.id}] ${(err as Error).message}`);
        continue;
      }
      for (const e of validators.validateModel(resolved)) errors.push(`[model ${p.id}/${m.id}] ${e}`);
      pickerModels.push(toPickerModel(m.id, resolved));
    }
    pickerProviders.push(toPickerProvider(p, pickerModels));
  }

  if (errors.length) throw new Error(`Validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  return pickerProviders;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pipeline.test.ts`
Expected: PASS — 1 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pipeline.ts tests/pipeline.test.ts
git commit -m "feat: pipeline (load+resolve+validate+default)"
```

---

## Task 11: `buildDist` + end-to-end emit

**Files:**
- Create: `scripts/lib/emit.ts`
- Test: `tests/emit.e2e.test.ts`

- [ ] **Step 1: Write the failing test — `tests/emit.e2e.test.ts`**

```ts
import { test, expect } from "bun:test";
import { join } from "node:path";
import { runPipeline } from "../scripts/lib/pipeline.ts";
import { buildDist } from "../scripts/lib/emit.ts";

const OPTS = {
  providersDir: join(import.meta.dir, "fixtures", "providers"),
  schemaDir: join(import.meta.dir, "..", "schema"),
};
const META = { generatedAt: "2026-05-30T00:00:00Z", commit: "testsha" };

test("assembles models.json, index.json, and per-provider files", () => {
  const dist = buildDist(runPipeline(OPTS), META);

  expect(dist.models.schemaVersion).toBe(1);
  expect(dist.models.generatedAt).toBe("2026-05-30T00:00:00Z");
  expect(dist.models.commit).toBe("testsha");
  expect(Object.keys(dist.models.providers)).toEqual(["acme", "wrap"]);
  expect(dist.models.providers.acme.models.length).toBe(2);

  expect(dist.index.providers).toEqual([
    { id: "acme", name: "Acme", kind: "api", modelCount: 2 },
    { id: "wrap", name: "Wrap", kind: "api", modelCount: 1 },
  ]);

  expect(dist.perProvider.wrap.provider.models[0].id).toBe("acme/base");
  expect(dist.perProvider.wrap.schemaVersion).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/emit.e2e.test.ts`
Expected: FAIL — cannot resolve `../scripts/lib/emit.ts`.

- [ ] **Step 3: Create `scripts/lib/emit.ts`**

```ts
import type { BuildMeta, DistOutput, IndexJson, ModelsJson, PickerProvider, ProviderFileJson } from "./types.ts";

/** Assemble the dist artifacts from resolved picker providers. */
export function buildDist(providers: PickerProvider[], meta: BuildMeta): DistOutput {
  const providersMap: Record<string, PickerProvider> = {};
  for (const p of providers) providersMap[p.id] = p;

  const models: ModelsJson = { schemaVersion: 1, ...meta, providers: providersMap };

  const index: IndexJson = {
    schemaVersion: 1,
    ...meta,
    providers: providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, modelCount: p.models.length })),
  };

  const perProvider: Record<string, ProviderFileJson> = {};
  for (const p of providers) perProvider[p.id] = { schemaVersion: 1, ...meta, provider: p };

  return { models, index, perProvider };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/emit.e2e.test.ts`
Expected: PASS — 1 pass.

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: PASS — all test files green.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/emit.ts tests/emit.e2e.test.ts
git commit -m "feat: assemble dist artifacts"
```

---

## Task 12: CLI scripts (`build.ts`, `validate.ts`)

**Files:**
- Create: `scripts/validate.ts`
- Create: `scripts/build.ts`

- [ ] **Step 1: Create `scripts/validate.ts`**

```ts
import { join } from "node:path";
import { runPipeline } from "./lib/pipeline.ts";

const ROOT = join(import.meta.dir, "..");
const providers = runPipeline({
  providersDir: join(ROOT, "providers"),
  schemaDir: join(ROOT, "schema"),
});
const modelCount = providers.reduce((n, p) => n + p.models.length, 0);
console.log(`✓ Valid — ${providers.length} providers, ${modelCount} models`);
```

- [ ] **Step 2: Create `scripts/build.ts`**

```ts
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { runPipeline } from "./lib/pipeline.ts";
import { buildDist } from "./lib/emit.ts";

const ROOT = join(import.meta.dir, "..");
const distDir = join(ROOT, "dist");

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

const providers = runPipeline({
  providersDir: join(ROOT, "providers"),
  schemaDir: join(ROOT, "schema"),
});
const meta = { generatedAt: new Date().toISOString(), commit: gitCommit() };
const dist = buildDist(providers, meta);

rmSync(distDir, { recursive: true, force: true });
mkdirSync(join(distDir, "providers"), { recursive: true });

const write = (rel: string, data: unknown) => {
  const fp = join(distDir, rel);
  mkdirSync(dirname(fp), { recursive: true });
  writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
};

write("models.json", dist.models);
write("index.json", dist.index);
for (const [id, file] of Object.entries(dist.perProvider)) write(`providers/${id}.json`, file);

const modelCount = providers.reduce((n, p) => n + p.models.length, 0);
console.log(`✓ Built dist/ — ${providers.length} providers, ${modelCount} models (commit ${meta.commit})`);
```

- [ ] **Step 3: Verify both scripts run against the (currently empty) real catalog**

Run: `bun run validate`
Expected: `✓ Valid — 0 providers, 0 models` (no `providers/` dir yet → 0). If it errors because `providers/` is missing, that's fine; proceed (the dir is created in Task 13).

> If `bun run validate` throws `ENOENT` on `providers/`, create the empty dir first: `mkdir providers` (PowerShell: `New-Item -ItemType Directory providers`), then re-run. Expected then: `✓ Valid — 0 providers, 0 models`.

- [ ] **Step 4: Commit**

```bash
git add scripts/build.ts scripts/validate.ts
git commit -m "feat: build + validate CLI scripts"
```

---

## Tasks 13–21: Seed provider catalog data

> For each provider: create `provider.toml` + model files, then run `bun run validate` (expect it to pass with the cumulative counts). **Numeric values (cost, context, dates) are best-effort and will be verified in Task 22.** Do NOT use `= null` in TOML — omit instead.

### Task 13: OpenAI

**Files:** `providers/openai/provider.toml`, `providers/openai/models/{gpt-5.5,gpt-5.4,gpt-5.4-mini}.toml`

- [ ] **Step 1: `providers/openai/provider.toml`**

```toml
name = "OpenAI"
env = ["OPENAI_API_KEY"]
doc = "https://platform.openai.com/docs/models"
api = "https://api.openai.com/v1"

[fleetify]
kind = "api"
models_endpoint = "/models"
supports_live = true
```

- [ ] **Step 2: `providers/openai/models/gpt-5.5.toml`**

```toml
name = "GPT-5.5"
family = "gpt-5"
release_date = "2026-02-01"
knowledge = "2025-10"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 1.25
output = 10.00
cache_read = 0.13

[limit]
context = 400000
output = 128000

[modalities]
input = ["text", "image"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 3: `providers/openai/models/gpt-5.4.toml`**

```toml
name = "GPT-5.4"
family = "gpt-5"
release_date = "2025-11-01"
knowledge = "2025-06"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 1.00
output = 8.00
cache_read = 0.10

[limit]
context = 400000
output = 128000

[modalities]
input = ["text", "image"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 4: `providers/openai/models/gpt-5.4-mini.toml`**

```toml
name = "GPT-5.4 mini"
family = "gpt-5"
release_date = "2025-11-01"
knowledge = "2025-06"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 0.25
output = 2.00
cache_read = 0.025

[limit]
context = 400000
output = 128000

[modalities]
input = ["text", "image"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 5: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 1 providers, 3 models`.

- [ ] **Step 6: Commit**

```bash
git add providers/openai/
git commit -m "data: seed openai provider + models"
```

### Task 14: Anthropic

**Files:** `providers/anthropic/provider.toml`, `providers/anthropic/models/{claude-opus-4-8,claude-sonnet-4-6,claude-haiku-4-5}.toml`

- [ ] **Step 1: `providers/anthropic/provider.toml`**

```toml
name = "Anthropic"
env = ["ANTHROPIC_API_KEY"]
doc = "https://docs.anthropic.com/en/docs/about-claude/models"
api = "https://api.anthropic.com/v1"

[fleetify]
kind = "api"
models_endpoint = "/models"
supports_live = true
```

- [ ] **Step 2: `providers/anthropic/models/claude-opus-4-8.toml`**

```toml
name = "Claude Opus 4.8"
family = "claude-opus"
release_date = "2026-01-01"
knowledge = "2025-08"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 5.00
output = 25.00
cache_read = 0.50
cache_write = 6.25

[limit]
context = 1000000
output = 64000

[modalities]
input = ["text", "image"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 3: `providers/anthropic/models/claude-sonnet-4-6.toml`**

```toml
name = "Claude Sonnet 4.6"
family = "claude-sonnet"
release_date = "2025-12-01"
knowledge = "2025-08"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 3.00
output = 15.00
cache_read = 0.30
cache_write = 3.75

[limit]
context = 1000000
output = 64000

[modalities]
input = ["text", "image"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 4: `providers/anthropic/models/claude-haiku-4-5.toml`**

```toml
name = "Claude Haiku 4.5"
family = "claude-haiku"
release_date = "2025-10-01"
knowledge = "2025-02"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 1.00
output = 5.00
cache_read = 0.10
cache_write = 1.25

[limit]
context = 200000
output = 64000

[modalities]
input = ["text", "image"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 5: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 2 providers, 6 models`.

- [ ] **Step 6: Commit**

```bash
git add providers/anthropic/
git commit -m "data: seed anthropic provider + models"
```

### Task 15: Google (Gemini)

**Files:** `providers/google/provider.toml`, `providers/google/models/{gemini-2.5-pro,gemini-2.5-flash}.toml`

- [ ] **Step 1: `providers/google/provider.toml`**

```toml
name = "Google"
env = ["GEMINI_API_KEY", "GOOGLE_API_KEY"]
doc = "https://ai.google.dev/gemini-api/docs/models"
api = "https://generativelanguage.googleapis.com/v1beta"

[fleetify]
kind = "api"
catalog_id = "google"
models_endpoint = "/models"
supports_live = true
```

- [ ] **Step 2: `providers/google/models/gemini-2.5-pro.toml`**

```toml
name = "Gemini 2.5 Pro"
family = "gemini-2.5"
release_date = "2025-06-01"
knowledge = "2025-01"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 1.25
output = 10.00
cache_read = 0.31

[limit]
context = 1000000
output = 65536

[modalities]
input = ["text", "image", "audio", "video"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 3: `providers/google/models/gemini-2.5-flash.toml`**

```toml
name = "Gemini 2.5 Flash"
family = "gemini-2.5"
release_date = "2025-06-01"
knowledge = "2025-01"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 0.30
output = 2.50
cache_read = 0.075

[limit]
context = 1000000
output = 65536

[modalities]
input = ["text", "image", "audio", "video"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 4: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 3 providers, 8 models`.

- [ ] **Step 5: Commit**

```bash
git add providers/google/
git commit -m "data: seed google provider + models"
```

### Task 16: DeepSeek

**Files:** `providers/deepseek/provider.toml`, `providers/deepseek/models/{deepseek-chat,deepseek-reasoner}.toml`

- [ ] **Step 1: `providers/deepseek/provider.toml`**

```toml
name = "DeepSeek"
env = ["DEEPSEEK_API_KEY"]
doc = "https://api-docs.deepseek.com/quick_start/pricing"
api = "https://api.deepseek.com/v1"

[fleetify]
kind = "api"
models_endpoint = "/models"
supports_live = true
```

- [ ] **Step 2: `providers/deepseek/models/deepseek-chat.toml`**

```toml
name = "DeepSeek-V3"
family = "deepseek"
release_date = "2025-03-01"
knowledge = "2024-07"
attachment = false
reasoning = false
tool_call = true
structured_output = true
temperature = true
open_weights = true

[cost]
input = 0.27
output = 1.10
cache_read = 0.07

[limit]
context = 128000
output = 8000

[modalities]
input = ["text"]
output = ["text"]
```

- [ ] **Step 3: `providers/deepseek/models/deepseek-reasoner.toml`**

```toml
name = "DeepSeek-R1"
family = "deepseek"
release_date = "2025-01-20"
knowledge = "2024-07"
attachment = false
reasoning = true
tool_call = true
structured_output = true
temperature = false
open_weights = true

[cost]
input = 0.55
output = 2.19
cache_read = 0.14

[limit]
context = 128000
output = 64000

[modalities]
input = ["text"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 4: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 4 providers, 10 models`.

- [ ] **Step 5: Commit**

```bash
git add providers/deepseek/
git commit -m "data: seed deepseek provider + models"
```

### Task 17: xAI (Grok)

**Files:** `providers/xai/provider.toml`, `providers/xai/models/{grok-4,grok-4-mini}.toml`

- [ ] **Step 1: `providers/xai/provider.toml`**

```toml
name = "xAI"
env = ["XAI_API_KEY"]
doc = "https://docs.x.ai/docs/models"
api = "https://api.x.ai/v1"

[fleetify]
kind = "api"
catalog_id = "xai"
models_endpoint = "/models"
supports_live = true
```

- [ ] **Step 2: `providers/xai/models/grok-4.toml`**

```toml
name = "Grok 4"
family = "grok-4"
release_date = "2025-07-09"
knowledge = "2025-04"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 3.00
output = 15.00
cache_read = 0.75

[limit]
context = 256000
output = 64000

[modalities]
input = ["text", "image"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 3: `providers/xai/models/grok-4-mini.toml`**

```toml
name = "Grok 4 mini"
family = "grok-4"
release_date = "2025-07-09"
knowledge = "2025-04"
attachment = true
reasoning = true
tool_call = true
structured_output = true
temperature = true

[cost]
input = 0.30
output = 0.50
cache_read = 0.075

[limit]
context = 256000
output = 64000

[modalities]
input = ["text", "image"]
output = ["text"]

[fleetify]
supports_effort = true
```

- [ ] **Step 4: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 5 providers, 12 models`.

- [ ] **Step 5: Commit**

```bash
git add providers/xai/
git commit -m "data: seed xai provider + models"
```

### Task 18: Perplexity (curated — no public /v1/models; endpoint override)

**Files:** `providers/perplexity/provider.toml`, `providers/perplexity/models/{sonar,sonar-pro,sonar-reasoning}.toml`

- [ ] **Step 1: `providers/perplexity/provider.toml`**

```toml
name = "Perplexity"
env = ["PERPLEXITY_API_KEY"]
doc = "https://docs.perplexity.ai/guides/model-cards"
api = "https://api.perplexity.ai"

[fleetify]
kind = "api"
catalog_id = "perplexity"
supports_live = false
```

- [ ] **Step 2: `providers/perplexity/models/sonar.toml`**

```toml
name = "Sonar"
family = "sonar"
attachment = false
reasoning = false
tool_call = false
temperature = true

[cost]
input = 1.00
output = 1.00

[limit]
context = 128000
output = 8000

[modalities]
input = ["text"]
output = ["text"]

[fleetify]
note = "Search"
```

- [ ] **Step 3: `providers/perplexity/models/sonar-pro.toml`**

```toml
name = "Sonar Pro"
family = "sonar"
attachment = false
reasoning = false
tool_call = false
temperature = true

[cost]
input = 3.00
output = 15.00

[limit]
context = 200000
output = 8000

[modalities]
input = ["text"]
output = ["text"]

[fleetify]
note = "Search"
```

- [ ] **Step 4: `providers/perplexity/models/sonar-reasoning.toml`**

```toml
name = "Sonar Reasoning"
family = "sonar"
attachment = false
reasoning = true
tool_call = false
temperature = true

[cost]
input = 1.00
output = 5.00

[limit]
context = 128000
output = 8000

[modalities]
input = ["text"]
output = ["text"]

[fleetify]
supports_effort = true
note = "Search"
endpoint = "/chat/completions"
```

- [ ] **Step 5: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 6 providers, 15 models`.

- [ ] **Step 6: Commit**

```bash
git add providers/perplexity/
git commit -m "data: seed perplexity provider + models"
```

### Task 19: Mistral (note badge + aliases)

**Files:** `providers/mistral/provider.toml`, `providers/mistral/models/{mistral-large,codestral}.toml`

- [ ] **Step 1: `providers/mistral/provider.toml`**

```toml
name = "Mistral"
env = ["MISTRAL_API_KEY"]
doc = "https://docs.mistral.ai/getting-started/models/models_overview/"
api = "https://api.mistral.ai/v1"

[fleetify]
kind = "api"
models_endpoint = "/models"
supports_live = true
```

- [ ] **Step 2: `providers/mistral/models/mistral-large.toml`**

```toml
name = "Mistral Large"
family = "mistral-large"
release_date = "2024-11-01"
knowledge = "2024-06"
attachment = false
reasoning = false
tool_call = true
structured_output = true
temperature = true

[cost]
input = 2.00
output = 6.00

[limit]
context = 128000
output = 16000

[modalities]
input = ["text"]
output = ["text"]

[fleetify]
aliases = ["mistral-large-latest", "mistral-large-2411"]
```

- [ ] **Step 3: `providers/mistral/models/codestral.toml`**

```toml
name = "Codestral"
family = "codestral"
release_date = "2025-01-13"
knowledge = "2024-06"
attachment = false
reasoning = false
tool_call = true
structured_output = true
temperature = true
open_weights = true

[cost]
input = 0.30
output = 0.90

[limit]
context = 256000
output = 16000

[modalities]
input = ["text"]
output = ["text"]

[fleetify]
note = "Code"
aliases = ["codestral-latest"]
```

- [ ] **Step 4: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 7 providers, 17 models`.

- [ ] **Step 5: Commit**

```bash
git add providers/mistral/
git commit -m "data: seed mistral provider + models"
```

### Task 20: NVIDIA NIM (subfolder id containing `/`)

**Files:** `providers/nvidia-nim/provider.toml`, `providers/nvidia-nim/models/meta/llama-4-maverick.toml`

- [ ] **Step 1: `providers/nvidia-nim/provider.toml`**

```toml
name = "NVIDIA NIM"
env = ["NVIDIA_API_KEY"]
doc = "https://docs.nvidia.com/nim/"
api = "https://integrate.api.nvidia.com/v1"

[fleetify]
kind = "api"
catalog_id = "nvidia-nim"
models_endpoint = "/models"
supports_live = true
```

- [ ] **Step 2: `providers/nvidia-nim/models/meta/llama-4-maverick.toml`** (id becomes `meta/llama-4-maverick`)

```toml
name = "Llama 4 Maverick"
family = "llama-4"
release_date = "2025-04-05"
knowledge = "2024-08"
attachment = true
reasoning = false
tool_call = true
structured_output = true
temperature = true
open_weights = true

[cost]
input = 0.20
output = 0.60

[limit]
context = 1000000
output = 16000

[modalities]
input = ["text", "image"]
output = ["text"]
```

- [ ] **Step 3: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 8 providers, 18 models`.

- [ ] **Step 4: Commit**

```bash
git add providers/nvidia-nim/
git commit -m "data: seed nvidia-nim provider + meta/llama subfolder model"
```

### Task 21: OpenRouter (mirror via `[extends]`)

**Files:** `providers/openrouter/provider.toml`, `providers/openrouter/models/anthropic/claude-opus-4-8.toml`

- [ ] **Step 1: `providers/openrouter/provider.toml`**

```toml
name = "OpenRouter"
env = ["OPENROUTER_API_KEY"]
doc = "https://openrouter.ai/docs/models"
api = "https://openrouter.ai/api/v1"

[fleetify]
kind = "api"
catalog_id = "openrouter"
models_endpoint = "/models"
supports_live = true
```

- [ ] **Step 2: `providers/openrouter/models/anthropic/claude-opus-4-8.toml`** (id `anthropic/claude-opus-4-8`; inherits from the anthropic canonical model, drops cost, adds a group)

```toml
[extends]
from = "anthropic/claude-opus-4-8"
omit = ["cost"]

[fleetify]
group = "via OpenRouter"
```

- [ ] **Step 3: Validate**

Run: `bun run validate`
Expected: `✓ Valid — 9 providers, 19 models`.

- [ ] **Step 4: Commit**

```bash
git add providers/openrouter/
git commit -m "data: seed openrouter mirror via [extends]"
```

---

## Task 22: Verify numeric model data against real sources

**Files:** any `providers/**/models/*.toml` needing corrections.

- [ ] **Step 1: Fetch the models.dev catalog for reference**

Use WebFetch (or the firecrawl skill) on `https://models.dev/api.json`. For each seeded model that has a counterpart there, compare `cost.input`, `cost.output`, `cost.cache_read`, `limit.context`, `limit.output`, `release_date`, and `knowledge`.

- [ ] **Step 2: Correct any mismatches**

For each discrepancy, edit the corresponding TOML to match the authoritative value. For models not present in models.dev (e.g. very new releases), confirm against the provider's official pricing/docs page (the `doc` URL in each `provider.toml`). If a number cannot be confirmed, leave the best-effort value and note it in the commit message.

- [ ] **Step 3: Re-validate**

Run: `bun run validate`
Expected: `✓ Valid — 9 providers, 19 models`.

- [ ] **Step 4: Commit (only if anything changed)**

```bash
git add providers/
git commit -m "data: verify model cost/context/dates against models.dev + provider docs"
```

---

## Task 23: First real build of `dist/`

**Files:** Create (generated): `dist/models.json`, `dist/index.json`, `dist/providers/*.json`

- [ ] **Step 1: Build**

Run: `bun run build`
Expected: `✓ Built dist/ — 9 providers, 19 models (commit <sha>)`.

- [ ] **Step 2: Sanity-check the output**

Run: `bun -e "const d=await Bun.file('dist/models.json').json(); console.log(d.schemaVersion, Object.keys(d.providers).length, d.providers.openrouter.models[0].id, d.providers.openrouter.models[0].cost)"`
Expected: prints `1 9 anthropic/claude-opus-4-8 null` (cost omitted by the mirror, schemaVersion 1, 9 providers).

- [ ] **Step 3: Commit the generated artifact**

```bash
git add dist/
git commit -m "build: generate dist/ catalog artifacts"
```

---

## Task 24: README + LICENSE

**Files:**
- Create: `README.md`
- Create: `LICENSE`

- [ ] **Step 1: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Fleetify

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create `README.md`**

````markdown
# fleetifydev/models

A TOML-based catalog of AI provider models. Edit TOML under `providers/`; a build
step compiles everything into `dist/models.json`, which the Fleetify app fetches
at runtime to populate its provider model pickers — so new models appear without
shipping an app release.

Modeled on [models.dev](https://github.com/anomalyco/models.dev), **minus the
website**: just the TOML configs, a small build-to-JSON step, and the generated
artifact.

## Layout

```
providers/<provider>/provider.toml      # provider metadata (source of truth)
providers/<provider>/models/<id>.toml   # one file per model; id = filename
schema/                                 # JSON Schema for provider + model
scripts/                                # build + validate (Bun + TypeScript)
dist/                                   # GENERATED — do not hand-edit
```

A model's `id` is its filename relative to `models/`. Ids containing `/` use
subfolders (e.g. `nvidia-nim/models/meta/llama-4-maverick.toml` →
`meta/llama-4-maverick`).

## Develop

```bash
bun install
bun run validate   # validate all TOML against schema/
bun run build      # write dist/models.json (+ index.json + per-provider files)
bun test           # unit + e2e tests
```

## Consume (app side)

Fetch the generated JSON over a CDN:

```
https://cdn.jsdelivr.net/gh/fleetifydev/models@main/dist/models.json
```

Pin a tag for stability: `…/fleetifydev/models@v1.0.0/dist/models.json`.
Smaller fetches: `dist/index.json` (provider list) and
`dist/providers/<id>.json` (one provider).

## Add or edit a model

1. Add/edit a `.toml` under `providers/<provider>/models/`. `name` is the only
   required field. Omit optional fields (TOML has no `null`).
2. Run `bun run validate`.
3. Open a PR. CI validates + builds; on merge, `dist/` is regenerated.

### Mirrors (`[extends]`)

```toml
# providers/openrouter/models/anthropic/claude-opus-4-8.toml
[extends]
from = "anthropic/claude-opus-4-8"   # <provider>/<model-id>
omit = ["cost"]                       # drop fields after merge (optional)

[fleetify]
group = "via OpenRouter"
```

## Schema versioning

`dist/models.json` carries a `schemaVersion`. Fields are added additively; the
field is bumped only on a breaking shape change. Consumers ignore unknown fields.

## License

MIT — see [LICENSE](./LICENSE).
````

- [ ] **Step 3: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: add README + MIT license"
```

---

## Task 25: CI workflows

**Files:**
- Create: `.github/workflows/validate.yml`
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create `.github/workflows/validate.yml`**

```yaml
name: validate
on:
  pull_request:
  push:
    branches-ignore: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run validate
      - run: bun run build
      - run: bun test
```

- [ ] **Step 2: Create `.github/workflows/publish.yml`**

```yaml
name: publish
on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: Commit dist/
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add dist/
          if git diff --staged --quiet; then
            echo "No dist changes."
          else
            git commit -m "chore: rebuild dist/ [skip ci]"
            git push
          fi
```

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add validate + publish workflows"
```

---

## Task 26: Final verification

- [ ] **Step 1: Clean install + full check**

Run: `bun install --frozen-lockfile`
Then: `bun run validate`
Then: `bun run build`
Then: `bun test`
Expected: all succeed; `✓ Valid — 9 providers, 19 models`; `✓ Built dist/ — 9 providers, 19 models`; all tests pass.

- [ ] **Step 2: Confirm a clean tree**

Run: `git status --porcelain`
Expected: empty (everything committed). If `dist/` changed because of the new build commit sha, `git add dist/ && git commit -m "build: refresh dist/"` (with trailer).

- [ ] **Step 3: Done — Phase 1 complete.**

The repo now: validates + builds TOML → `dist/models.json` (+ `index.json` + per-provider), has 9 seeded providers / 19 models, full test coverage of the pipeline, MIT license, README, and CI. Push when ready (e.g. `git push -u origin main`) — only on the user's request.

---

## Self-review notes (author)

- **Spec coverage:** §2 layout (all dirs created; `scripts/sync/` intentionally deferred per design §2), §3 provider schema (Task 2), §4 model schema incl. `[extends]` (Tasks 2, 7, 21), §5 dist shape incl. index + per-provider (Tasks 11, 23), §6 build/validate (Tasks 10, 12), §7 distribution/README CDN URL (Task 24), §9 CI (Task 25), §10 versioning (schemaVersion=1, in types/emit). §8 sync + §11/§12 Phase 2/3 are out of scope by design.
- **Placeholders:** none — every code/TOML step has full content; numeric data is explicitly best-effort with a dedicated verification task (22).
- **Type consistency:** `deriveId`, `loadCatalog`, `resolveExtends`, `toPickerModel`/`toPickerProvider`, `createValidators`, `runPipeline`, `buildDist` signatures match across tasks; `PickerModel`/`PickerProvider`/`DistOutput` used consistently in emit + scripts.
