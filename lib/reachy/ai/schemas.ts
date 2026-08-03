import { z } from "zod";

// ── Extraction ─────────────────────────────────────────────────────────

export const SELLER_TYPES = ["SELLER", "VENDOR", "AGENCY", "UNKNOWN"] as const;
export const ADVERTISING_TYPES = ["SP", "SB", "SD", "DSP", "NONE", "UNKNOWN"] as const;

export const painPointExtractionSchema = z.object({
  problem: z.string(),
  category: z.string(),
  subcategory: z.string().nullable(),
  sellerType: z.enum(SELLER_TYPES),
  advertisingType: z.enum(ADVERTISING_TYPES),
  severity: z.number().int().min(1).max(5),
  frequency: z.number().int().min(1).max(5),
  emotion: z.string().nullable(),
  possibleSolution: z.string().nullable(),
  competitors: z.array(z.string()),
  quote: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type PainPointExtraction = z.infer<typeof painPointExtractionSchema>;

export const extractionResultSchema = z.object({
  painPoints: z.array(painPointExtractionSchema),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** OpenAI strict structured-output JSON Schema mirroring `extractionResultSchema`. */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    painPoints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          problem: { type: "string", description: "The concrete problem/pain point, one sentence, in plain English." },
          category: { type: "string", description: "High-level category, e.g. 'Fees & Reimbursements', 'Advertising Performance'." },
          subcategory: { type: ["string", "null"], description: "More specific subcategory, or null." },
          sellerType: { type: "string", enum: SELLER_TYPES },
          advertisingType: { type: "string", enum: ADVERTISING_TYPES },
          severity: { type: "integer", minimum: 1, maximum: 5, description: "How severe this is for the person experiencing it, 1-5." },
          frequency: { type: "integer", minimum: 1, maximum: 5, description: "How often this kind of problem seems to come up based on the text's language, 1-5." },
          emotion: { type: ["string", "null"], description: "Dominant emotion expressed, e.g. 'frustrated', 'anxious', or null." },
          possibleSolution: { type: ["string", "null"], description: "A concrete solution/feature idea that would address this, or null." },
          competitors: { type: "array", items: { type: "string" }, description: "Named competitor products/companies mentioned, if any." },
          quote: { type: "string", description: "A short verbatim excerpt (<= 300 chars) from the source text supporting this extraction." },
          confidenceScore: { type: "number", minimum: 0, maximum: 1, description: "Model's confidence that this is a real, correctly-classified pain point." },
        },
        required: [
          "problem",
          "category",
          "subcategory",
          "sellerType",
          "advertisingType",
          "severity",
          "frequency",
          "emotion",
          "possibleSolution",
          "competitors",
          "quote",
          "confidenceScore",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["painPoints"],
  additionalProperties: false,
} as const;

// ── Scoring ────────────────────────────────────────────────────────────

export const SCORE_FACTORS = [
  "frequency",
  "businessImpact",
  "easeOfBuilding",
  "potentialRevenue",
  "aiSuitability",
  "urgency",
  "competition",
] as const;

export type ScoreFactor = (typeof SCORE_FACTORS)[number];

export const FACTOR_WEIGHTS: Record<ScoreFactor, number> = {
  frequency: 0.2,
  businessImpact: 0.2,
  easeOfBuilding: 0.15,
  potentialRevenue: 0.15,
  aiSuitability: 0.15,
  urgency: 0.1,
  // Inverse factor: the model scores "how uncrowded is this space" (10 = little competition).
  competition: 0.05,
};

export const factorScoreSchema = z.object({
  score: z.number().int().min(0).max(10),
  rationale: z.string(),
});

export const scoringResultSchema = z.object({
  frequency: factorScoreSchema,
  businessImpact: factorScoreSchema,
  easeOfBuilding: factorScoreSchema,
  potentialRevenue: factorScoreSchema,
  aiSuitability: factorScoreSchema,
  urgency: factorScoreSchema,
  competition: factorScoreSchema,
});

export type ScoringResult = z.infer<typeof scoringResultSchema>;

function factorProperty(description: string) {
  return {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 0, maximum: 10, description },
      rationale: { type: "string", description: "One sentence explaining this sub-score." },
    },
    required: ["score", "rationale"],
    additionalProperties: false,
  } as const;
}

export const SCORING_JSON_SCHEMA = {
  type: "object",
  properties: {
    frequency: factorProperty("How often this problem shows up across the Amazon seller/vendor/advertising ecosystem, 0-10."),
    businessImpact: factorProperty("How much money/time/risk this costs the business experiencing it, 0-10."),
    easeOfBuilding: factorProperty("How feasible it is to build a product/feature that solves this with current tech, 0-10 (10 = easy)."),
    potentialRevenue: factorProperty("How much a solution to this could plausibly be monetized for, 0-10."),
    aiSuitability: factorProperty("How well-suited this problem is to an AI-driven solution, 0-10."),
    urgency: factorProperty("How time-sensitive solving this is right now, 0-10."),
    competition: factorProperty("How little existing competition addresses this well, 0-10 (10 = wide open, 0 = saturated)."),
  },
  required: [...SCORE_FACTORS],
  additionalProperties: false,
} as const;

export function computeOpportunityScore(result: ScoringResult): number {
  const weighted = SCORE_FACTORS.reduce((sum, factor) => sum + result[factor].score * FACTOR_WEIGHTS[factor], 0);
  // weighted is out of 10 -> scale to 0-100
  return Math.round(weighted * 10);
}

export function buildScoreBreakdown(result: ScoringResult) {
  return SCORE_FACTORS.map((factor) => ({
    factor,
    score: result[factor].score,
    weight: FACTOR_WEIGHTS[factor],
    rationale: result[factor].rationale,
  }));
}

// ── Weekly report summary ─────────────────────────────────────────────

export const summaryResultSchema = z.object({
  executiveSummary: z.string(),
  emergingTrends: z.array(z.string()),
  featureIdeas: z.array(z.string()),
  productsWorthBuilding: z.array(z.string()),
  revenueOpportunities: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type SummaryResult = z.infer<typeof summaryResultSchema>;

export const SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string", description: "2-4 sentence executive summary of the period." },
    emergingTrends: { type: "array", items: { type: "string" }, description: "Notable trends, grounded only in the provided data." },
    featureIdeas: { type: "array", items: { type: "string" }, description: "Concrete feature ideas that would address top pain points." },
    productsWorthBuilding: { type: "array", items: { type: "string" }, description: "Standalone product concepts worth building, if any." },
    revenueOpportunities: { type: "array", items: { type: "string" }, description: "Where the revenue upside is, tied to specific pain points." },
    recommendations: { type: "array", items: { type: "string" }, description: "Concrete next actions for leadership." },
  },
  required: ["executiveSummary", "emergingTrends", "featureIdeas", "productsWorthBuilding", "revenueOpportunities", "recommendations"],
  additionalProperties: false,
} as const;
