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
