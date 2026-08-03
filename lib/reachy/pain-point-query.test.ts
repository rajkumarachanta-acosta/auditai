import { describe, expect, it } from "vitest";
import { parsePainPointFilters } from "./pain-point-query";

describe("parsePainPointFilters", () => {
  it("parses a full set of filters", () => {
    const usp = new URLSearchParams({
      q: "fees",
      category: "fees-reimbursements",
      sellerType: "SELLER",
      advertisingType: "SP",
      minScore: "50",
      maxScore: "90",
      from: "2026-01-01",
      to: "2026-01-31",
      page: "2",
      pageSize: "10",
      sort: "recent",
    });

    const filters = parsePainPointFilters(usp);

    expect(filters.q).toBe("fees");
    expect(filters.category).toBe("fees-reimbursements");
    expect(filters.sellerType).toBe("SELLER");
    expect(filters.advertisingType).toBe("SP");
    expect(filters.minScore).toBe(50);
    expect(filters.maxScore).toBe(90);
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(10);
    expect(filters.sort).toBe("recent");
  });

  it("rejects invalid enum values rather than passing them through to Prisma", () => {
    const usp = new URLSearchParams({ sellerType: "NOT_A_TYPE", advertisingType: "ALSO_BAD" });
    const filters = parsePainPointFilters(usp);
    expect(filters.sellerType).toBeUndefined();
    expect(filters.advertisingType).toBeUndefined();
  });

  it("defaults sort to score when absent or invalid", () => {
    expect(parsePainPointFilters(new URLSearchParams()).sort).toBe("score");
    expect(parsePainPointFilters(new URLSearchParams({ sort: "bogus" })).sort).toBe("score");
  });

  it("leaves everything undefined for an empty query", () => {
    const filters = parsePainPointFilters(new URLSearchParams());
    expect(filters.q).toBeUndefined();
    expect(filters.minScore).toBeUndefined();
    expect(filters.page).toBeUndefined();
  });
});
