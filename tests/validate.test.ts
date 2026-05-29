import { test, expect } from "bun:test";
import { join } from "node:path";
import { createValidators } from "../scripts/lib/validate.ts";

const SCHEMA = join(import.meta.dir, "..", "schema");

test("accepts a valid model and provider", () => {
  const v = createValidators(SCHEMA);
  expect(v.validateModel({ name: "GPT", limit: { context: 1000 } })).toEqual([]);
  expect(v.validateProvider({ name: "OpenAI", env: ["OPENAI_API_KEY"] })).toEqual([]);
});

test("rejects a model missing name", () => {
  const v = createValidators(SCHEMA);
  expect(v.validateModel({ reasoning: true }).length).toBeGreaterThan(0);
});

test("rejects unknown fields (additionalProperties:false)", () => {
  const v = createValidators(SCHEMA);
  expect(v.validateModel({ name: "X", bogus: 1 }).length).toBeGreaterThan(0);
});

test("rejects a bad release_date format", () => {
  const v = createValidators(SCHEMA);
  expect(v.validateModel({ name: "X", release_date: "Feb 2026" }).length).toBeGreaterThan(0);
});
