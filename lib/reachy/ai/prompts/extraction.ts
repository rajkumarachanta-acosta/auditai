import type { NormalizedItem } from "../../connectors/types";

export function buildExtractionUserPrompt(item: NormalizedItem, sourceName: string): string {
  return `Source: ${sourceName}
Title: ${item.title}
${item.author ? `Author: ${item.author}\n` : ""}${item.publishedAt ? `Published: ${item.publishedAt.toISOString()}\n` : ""}
---
${item.content}
---

Extract every distinct, genuine pain point an Amazon seller, vendor, or advertising practitioner expresses in the text above. A pain point is a concrete problem, frustration, or unmet need — not a neutral statement of fact or a question with no complaint behind it.

If the text contains no genuine pain point, return an empty "painPoints" array. Do not force an extraction.`;
}
