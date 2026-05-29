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
