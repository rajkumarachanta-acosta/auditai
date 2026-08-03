import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and dashes separators", () => {
    expect(slugify("Fees & Reimbursements")).toBe("fees-reimbursements");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("  --Helium 10!!--  ")).toBe("helium-10");
  });

  it("falls back to a placeholder for empty input", () => {
    expect(slugify("   ")).toBe("item");
  });

  it("caps length at 80 chars", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
});
