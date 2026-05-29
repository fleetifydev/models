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
