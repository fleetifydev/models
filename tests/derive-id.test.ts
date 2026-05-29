import { test, expect } from "bun:test";
import { deriveId } from "../scripts/lib/derive-id.ts";

test("derives id from a flat filename", () => {
  expect(deriveId("/x/providers/openai/models/gpt-5.5.toml", "/x/providers/openai/models")).toBe("gpt-5.5");
});

test("derives a slash id from a subfolder", () => {
  expect(
    deriveId("/x/providers/nvidia-nim/models/meta/llama-4-maverick.toml", "/x/providers/nvidia-nim/models"),
  ).toBe("meta/llama-4-maverick");
});

test("normalizes Windows backslash separators", () => {
  expect(deriveId("C:\\p\\models\\meta\\llama.toml", "C:\\p\\models")).toBe("meta/llama");
});
