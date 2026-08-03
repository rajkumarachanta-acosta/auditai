import { describe, expect, it } from "vitest";
import { computeOpportunityScore, buildScoreBreakdown, SCORE_FACTORS, FACTOR_WEIGHTS, type ScoringResult } from "./schemas";

function makeResult(scores: Record<(typeof SCORE_FACTORS)[number], number>): ScoringResult {
  return Object.fromEntries(
    SCORE_FACTORS.map((factor) => [factor, { score: scores[factor], rationale: `${factor} rationale` }])
  ) as ScoringResult;
}

describe("opportunity scoring", () => {
  it("weights sum to 1 (so scores land on a true 0-100 scale)", () => {
    const total = SCORE_FACTORS.reduce((sum, f) => sum + FACTOR_WEIGHTS[f], 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("scores 100 when every factor is maxed", () => {
    const result = makeResult({
      frequency: 10,
      businessImpact: 10,
      easeOfBuilding: 10,
      potentialRevenue: 10,
      aiSuitability: 10,
      urgency: 10,
      competition: 10,
    });
    expect(computeOpportunityScore(result)).toBe(100);
  });

  it("scores 0 when every factor is 0", () => {
    const result = makeResult({
      frequency: 0,
      businessImpact: 0,
      easeOfBuilding: 0,
      potentialRevenue: 0,
      aiSuitability: 0,
      urgency: 0,
      competition: 0,
    });
    expect(computeOpportunityScore(result)).toBe(0);
  });

  it("computes the expected weighted score for a mixed case", () => {
    const scores = {
      frequency: 8,
      businessImpact: 9,
      easeOfBuilding: 5,
      potentialRevenue: 7,
      aiSuitability: 10,
      urgency: 6,
      competition: 4,
    };
    const expected = Math.round(
      SCORE_FACTORS.reduce((sum, f) => sum + scores[f] * FACTOR_WEIGHTS[f], 0) * 10
    );
    expect(computeOpportunityScore(makeResult(scores))).toBe(expected);
  });

  it("breakdown carries every factor's score, weight, and rationale for display", () => {
    const result = makeResult({
      frequency: 3,
      businessImpact: 4,
      easeOfBuilding: 5,
      potentialRevenue: 6,
      aiSuitability: 7,
      urgency: 8,
      competition: 9,
    });
    const breakdown = buildScoreBreakdown(result);
    expect(breakdown).toHaveLength(SCORE_FACTORS.length);
    for (const entry of breakdown) {
      expect(entry.weight).toBe(FACTOR_WEIGHTS[entry.factor as keyof typeof FACTOR_WEIGHTS]);
      expect(entry.rationale).toContain(entry.factor);
    }
  });
});
