import { runStructured } from "./client";
import { REACHY_SYSTEM_PROMPT } from "./prompts/system";
import { buildScoringUserPrompt } from "./prompts/scoring";
import {
  scoringResultSchema,
  SCORING_JSON_SCHEMA,
  computeOpportunityScore,
  buildScoreBreakdown,
  type PainPointExtraction,
} from "./schemas";

export interface OpportunityScoreResult {
  opportunityScore: number;
  scoreBreakdown: ReturnType<typeof buildScoreBreakdown>;
}

export async function scorePainPoint(extraction: PainPointExtraction): Promise<OpportunityScoreResult> {
  const raw = await runStructured<unknown>({
    system: REACHY_SYSTEM_PROMPT,
    user: buildScoringUserPrompt(extraction),
    schemaName: "opportunity_scoring",
    schema: SCORING_JSON_SCHEMA,
  });

  const result = scoringResultSchema.parse(raw);

  return {
    opportunityScore: computeOpportunityScore(result),
    scoreBreakdown: buildScoreBreakdown(result),
  };
}
