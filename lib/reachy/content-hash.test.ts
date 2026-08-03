import { describe, expect, it } from "vitest";
import { contentHashOf } from "./content-hash";
import type { NormalizedItem } from "./connectors/types";

function item(overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    externalId: "1",
    title: "FBA fees keep changing without notice",
    url: "https://example.com/1",
    content: "Every month my FBA fees change and I have no idea why.",
    ...overrides,
  };
}

describe("contentHashOf", () => {
  it("is stable for identical content", () => {
    expect(contentHashOf(item())).toBe(contentHashOf(item()));
  });

  it("is case- and whitespace-insensitive (near-duplicate dedup)", () => {
    const a = item();
    const b = item({
      title: "  FBA FEES keep changing   without notice  ",
      content: "EVERY month my fba fees change and I have no idea why.",
    });
    expect(contentHashOf(a)).toBe(contentHashOf(b));
  });

  it("differs when the content actually differs", () => {
    const a = item();
    const b = item({ content: "Completely different pain point about ACOS spiking." });
    expect(contentHashOf(a)).not.toBe(contentHashOf(b));
  });

  it("ignores externalId/url when hashing (content-based, not identity-based)", () => {
    const a = item({ externalId: "1", url: "https://example.com/1" });
    const b = item({ externalId: "2", url: "https://example.com/2" });
    expect(contentHashOf(a)).toBe(contentHashOf(b));
  });
});
