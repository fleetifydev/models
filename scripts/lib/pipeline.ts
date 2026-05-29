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
