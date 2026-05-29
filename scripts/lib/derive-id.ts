import { relative } from "node:path";

/** Model id = path relative to the provider's models/ root, sans .toml, POSIX-separated. */
export function deriveId(modelPath: string, modelsRoot: string): string {
  const rel = relative(modelsRoot, modelPath);
  return rel.replace(/\.toml$/i, "").split(/[\\/]/).join("/");
}
