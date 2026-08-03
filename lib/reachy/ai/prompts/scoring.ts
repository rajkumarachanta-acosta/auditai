import type { PainPointExtraction } from "../schemas";

export function buildScoringUserPrompt(extraction: PainPointExtraction): string {
  return `Pain point: ${extraction.problem}
Category: ${extraction.category}${extraction.subcategory ? ` / ${extraction.subcategory}` : ""}
Seller type: ${extraction.sellerType}
Advertising type: ${extraction.advertisingType}
Severity (as reported): ${extraction.severity}/5
Emotion: ${extraction.emotion ?? "unspecified"}
Possible solution: ${extraction.possibleSolution ?? "none suggested"}
Competitors mentioned: ${extraction.competitors.length ? extraction.competitors.join(", ") : "none"}
Supporting quote: "${extraction.quote}"

Score this pain point as a business opportunity for A One (an AI workforce platform selling into Amazon Advertising agencies and brands) across each of the seven factors in the schema. Give a 0-10 score and a one-sentence rationale for each factor, grounded in what's actually stated above — do not assume facts not given.`;
}
