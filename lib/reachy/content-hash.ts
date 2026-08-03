import { createHash } from "node:crypto";
import type { NormalizedItem } from "./connectors/types";

function normalizeForHash(item: NormalizedItem): string {
  return `${item.title.trim().toLowerCase()}\n${item.content.trim().toLowerCase()}`.replace(/\s+/g, " ");
}

export function contentHashOf(item: NormalizedItem): string {
  return createHash("sha256").update(normalizeForHash(item)).digest("hex");
}
