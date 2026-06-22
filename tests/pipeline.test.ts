import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPipeline } from "../scripts/lib/pipeline.ts";

const OPTS = {
  providersDir: join(import.meta.dir, "fixtures", "providers"),
  schemaDir: join(import.meta.dir, "..", "schema"),
};

test("produces providers + models with resolved extends and defaults", () => {
  const providers = runPipeline(OPTS);
  expect(providers.map((p) => p.id)).toEqual(["acme", "wrap"]);

  const acme = providers.find((p) => p.id === "acme")!;
  expect(acme.models.map((m) => m.id)).toEqual(["base", "nested/mini"]);
  const acmeBase = acme.models.find((m) => m.id === "base")!;
  expect(acmeBase.supports_effort).toBe(true); // reasoning -> supports_effort
  expect(acmeBase.context).toBe(100000);

  const wrapModel = providers.find((p) => p.id === "wrap")!.models[0];
  expect(wrapModel.id).toBe("acme/base");
  expect(wrapModel.label).toBe("Acme Base"); // inherited name
  expect(wrapModel.cost).toBeNull(); // omitted
  expect(wrapModel.group).toBe("via Wrap");
});

test("rejects a provider with two default models", () => {
  const dir = mkdtempSync(join(tmpdir(), "fm-"));
  const prov = join(dir, "providers", "acme", "models");
  mkdirSync(prov, { recursive: true });
  writeFileSync(join(dir, "providers", "acme", "provider.toml"), 'name = "Acme"\n[fleetify]\nkind = "api"\n');
  writeFileSync(join(prov, "a.toml"), 'name = "A"\n[fleetify]\ndefault = true\n');
  writeFileSync(join(prov, "b.toml"), 'name = "B"\n[fleetify]\ndefault = true\n');
  cpSync(join(import.meta.dir, "..", "schema"), join(dir, "schema"), { recursive: true });
  expect(() => runPipeline({ providersDir: join(dir, "providers"), schemaDir: join(dir, "schema") }))
    .toThrow(/more than one default model/);
});
