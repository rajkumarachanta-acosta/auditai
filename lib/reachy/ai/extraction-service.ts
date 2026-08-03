import { runStructured } from "./client";
import { REACHY_SYSTEM_PROMPT } from "./prompts/system";
import { buildExtractionUserPrompt } from "./prompts/extraction";
import { extractionResultSchema, EXTRACTION_JSON_SCHEMA, type ExtractionResult } from "./schemas";
import type { NormalizedItem } from "../connectors/types";

export async function extractPainPoints(item: NormalizedItem, sourceName: string): Promise<ExtractionResult> {
  const raw = await runStructured<unknown>({
    system: REACHY_SYSTEM_PROMPT,
    user: buildExtractionUserPrompt(item, sourceName),
    schemaName: "pain_point_extraction",
    schema: EXTRACTION_JSON_SCHEMA,
  });

  // Defensive re-validation: strict mode should guarantee shape, but we never
  // trust a model output without checking it before it touches the database.
  return extractionResultSchema.parse(raw);
}
