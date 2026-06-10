import { posix } from "node:path";

/** Model id = path relative to the provider's models/ root, sans .toml, POSIX-separated. */
export function deriveId(modelPath: string, modelsRoot: string): string {
  // Normalize backslashes to forward slashes first so derivation is identical
  // across platforms: native Windows paths use `\`, but the CI runner is POSIX
  // and node:path.relative is platform-specific. Using posix.relative on
  // already-normalized inputs makes the result deterministic everywhere.
  const toPosix = (p: string) => p.replace(/\\/g, "/");
  const rel = posix.relative(toPosix(modelsRoot), toPosix(modelPath));
  return rel.replace(/\.toml$/i, "");
}
