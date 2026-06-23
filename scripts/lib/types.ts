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

export type EffortCapability =
  | { kind: "levels"; levels: string[]; default: string }
  | { kind: "thinking_level"; levels: string[]; default: string }
  | { kind: "budget"; min: number; max: number; default: number; can_disable: boolean }
  | { kind: "toggle"; default: boolean }
  | { kind: "none" };

export interface FleetifyModelExtras {
  label?: string;
  supports_effort?: boolean;
  group?: string;
  note?: string;
  endpoint?: string;
  hidden?: boolean;
  /** Master availability switch. Omitted ⇒ active. When false the model is
   *  hidden from the picker, unselectable, and rejected at chat-send time. */
  active?: boolean;
  default?: boolean;
  aliases?: string[];
  effort?: EffortCapability;
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
  effort: EffortCapability;
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
  active: boolean;
  default: boolean;
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
