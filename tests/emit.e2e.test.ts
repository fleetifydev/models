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

test("preserves pull tags and embedding output in both catalog forms", () => {
  const dist = buildDist(runPipeline(OPTS), META);
  const models = dist.models.providers.acme.models;
  const mini = models.find((model) => model.id === "nested/mini");

  expect(mini?.tags).toEqual(["0.5b", "1.5b"]);
  expect(mini?.modalities).toEqual({ input: ["text"], output: ["embedding"] });
  expect(dist.perProvider.acme.provider.models).toEqual(models);
  expect(models.find((model) => model.id === "base")).not.toHaveProperty("tags");
});
