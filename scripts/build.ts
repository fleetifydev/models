import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { runPipeline } from "./lib/pipeline.ts";
import { buildDist } from "./lib/emit.ts";

const ROOT = join(import.meta.dir, "..");
const distDir = join(ROOT, "dist");

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

const providers = runPipeline({
  providersDir: join(ROOT, "providers"),
  schemaDir: join(ROOT, "schema"),
});
const meta = { generatedAt: new Date().toISOString(), commit: gitCommit() };
const dist = buildDist(providers, meta);

rmSync(distDir, { recursive: true, force: true });
mkdirSync(join(distDir, "providers"), { recursive: true });

const write = (rel: string, data: unknown) => {
  const fp = join(distDir, rel);
  mkdirSync(dirname(fp), { recursive: true });
  writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
};

write("models.json", dist.models);
write("index.json", dist.index);
for (const [id, file] of Object.entries(dist.perProvider)) write(`providers/${id}.json`, file);

const modelCount = providers.reduce((n, p) => n + p.models.length, 0);
console.log(`✓ Built dist/ — ${providers.length} providers, ${modelCount} models (commit ${meta.commit})`);
