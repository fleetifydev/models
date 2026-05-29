# fleetifydev/models

A TOML-based catalog of AI provider models. Edit TOML under `providers/`; a build
step compiles everything into `dist/models.json`, which the Fleetify app fetches
at runtime to populate its provider model pickers — so new models appear without
shipping an app release.

## Layout

```
providers/<provider>/provider.toml      # provider metadata (source of truth)
providers/<provider>/models/<id>.toml   # one file per model; id = filename
schema/                                 # JSON Schema for provider + model
scripts/                                # build + validate (Bun + TypeScript)
dist/                                   # GENERATED — do not hand-edit
```

A model's `id` is its filename relative to `models/`. Ids containing `/` use
subfolders (e.g. `nvidia-nim/models/meta/llama-4-maverick-17b-128e-instruct.toml`
→ `meta/llama-4-maverick-17b-128e-instruct`).

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
3. Run `bun run build` to regenerate `dist/`, and commit it alongside your change. Open a PR.

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
