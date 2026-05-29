import Ajv, { type ErrorObject } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Validators {
  validateProvider: (data: unknown) => string[];
  validateModel: (data: unknown) => string[];
}

function fmt(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
}

/** Compile the provider + model JSON schemas; return validators returning error strings ([] = ok). */
export function createValidators(schemaDir: string): Validators {
  const ajv = new Ajv({ allErrors: true });
  const providerSchema = JSON.parse(readFileSync(join(schemaDir, "provider.schema.json"), "utf8"));
  const modelSchema = JSON.parse(readFileSync(join(schemaDir, "model.schema.json"), "utf8"));
  const vp = ajv.compile(providerSchema);
  const vm = ajv.compile(modelSchema);
  return {
    validateProvider: (d) => (vp(d) ? [] : fmt(vp.errors)),
    validateModel: (d) => (vm(d) ? [] : fmt(vm.errors)),
  };
}
