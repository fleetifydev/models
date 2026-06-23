import type { ModelToml, PickerModel, PickerProvider, RawProviderEntry } from "./types.ts";

/** Apply Fleetify picker defaults and flatten a resolved model into the dist shape. */
export function toPickerModel(id: string, m: ModelToml): PickerModel {
  const f = m.fleetify ?? {};
  const reasoning = m.reasoning ?? false;
  const effort = f.effort ?? { kind: "none" as const };
  return {
    id,
    label: f.label ?? m.name ?? id,
    family: m.family ?? null,
    context: m.limit?.context ?? null,
    output_limit: m.limit?.output ?? null,
    reasoning,
    supports_effort: f.supports_effort ?? (f.effort ? f.effort.kind !== "none" : reasoning),
    effort,
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
    active: f.active ?? true,
    default: f.default ?? false,
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
