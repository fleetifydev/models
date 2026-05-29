import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { deriveId } from "./derive-id.ts";
import type { RawCatalog, RawProviderEntry, RawModelEntry, ProviderToml, ModelToml } from "./types.ts";

function walkToml(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkToml(full));
    else if (name.endsWith(".toml")) out.push(full);
  }
  return out;
}

/** Walk providers/, parse every provider.toml and models/*.toml (recursive), derive ids. */
export function loadCatalog(providersDir: string): RawCatalog {
  const providers: RawProviderEntry[] = [];
  for (const providerId of readdirSync(providersDir)) {
    const providerDir = join(providersDir, providerId);
    if (!statSync(providerDir).isDirectory()) continue;

    const providerTomlPath = join(providerDir, "provider.toml");
    if (!existsSync(providerTomlPath)) {
      throw new Error(`Missing provider.toml in ${providerDir}`);
    }
    const data = parseToml(readFileSync(providerTomlPath, "utf8")) as unknown as ProviderToml;

    const modelsRoot = join(providerDir, "models");
    const models: RawModelEntry[] = [];
    if (existsSync(modelsRoot)) {
      for (const file of walkToml(modelsRoot)) {
        const id = deriveId(file, modelsRoot);
        const mdata = parseToml(readFileSync(file, "utf8")) as unknown as ModelToml;
        models.push({ id, providerId, data: mdata });
      }
    }
    models.sort((a, b) => a.id.localeCompare(b.id));
    providers.push({ id: providerId, data, models });
  }
  providers.sort((a, b) => a.id.localeCompare(b.id));
  return { providers };
}
