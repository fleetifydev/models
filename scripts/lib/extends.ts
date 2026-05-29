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
