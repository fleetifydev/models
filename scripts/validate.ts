import { join } from "node:path";
import { runPipeline } from "./lib/pipeline.ts";

const ROOT = join(import.meta.dir, "..");
const providers = runPipeline({
  providersDir: join(ROOT, "providers"),
  schemaDir: join(ROOT, "schema"),
});
const modelCount = providers.reduce((n, p) => n + p.models.length, 0);
console.log(`✓ Valid — ${providers.length} providers, ${modelCount} models`);
