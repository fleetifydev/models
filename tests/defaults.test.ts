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

test("effort: explicit descriptor passes through and drives supports_effort", () => {
  const m = toPickerModel("opus", {
    name: "Opus", reasoning: true,
    fleetify: { effort: { kind: "levels", levels: ["low", "high"], default: "high" } },
  });
  expect(m.effort).toEqual({ kind: "levels", levels: ["low", "high"], default: "high" });
  expect(m.supports_effort).toBe(true);
});

test("effort: kind 'none' forces supports_effort false even when reasoning=true", () => {
  const m = toPickerModel("haiku", {
    name: "Haiku", reasoning: true,
    fleetify: { effort: { kind: "none" } },
  });
  expect(m.effort).toEqual({ kind: "none" });
  expect(m.supports_effort).toBe(false);
});

test("effort: absent → kind 'none' and supports_effort falls back to reasoning", () => {
  const m = toPickerModel("x", { name: "X", reasoning: true });
  expect(m.effort).toEqual({ kind: "none" });
  expect(m.supports_effort).toBe(true);
});

test("effort: explicit supports_effort=false wins even with a levels descriptor", () => {
  const m = toPickerModel("m", {
    name: "M", reasoning: true,
    fleetify: { supports_effort: false, effort: { kind: "levels", levels: ["low", "high"], default: "high" } },
  });
  expect(m.supports_effort).toBe(false);
  expect(m.effort).toEqual({ kind: "levels", levels: ["low", "high"], default: "high" });
});
