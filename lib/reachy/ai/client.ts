import OpenAI from "openai";
import { createLogger } from "../logger";

const logger = createLogger("ai");

let client: OpenAI | null = null;

export function getOpenAiClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export const REACHY_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

/**
 * Runs a single structured-output chat completion and parses the JSON
 * response against the given schema name. Never falls back to free text —
 * if the model can't produce schema-conformant JSON, this throws rather
 * than guessing, so callers never store a hallucinated shape.
 */
export async function runStructured<T>(args: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const openai = getOpenAiClient();

  const completion = await openai.chat.completions.create({
    model: REACHY_MODEL,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        schema: args.schema,
        strict: true,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    logger.error("Empty structured-output response", { schemaName: args.schemaName });
    throw new Error(`OpenAI returned no content for schema ${args.schemaName}`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error("Failed to parse structured-output JSON", { schemaName: args.schemaName, error: String(error) });
    throw new Error(`OpenAI returned invalid JSON for schema ${args.schemaName}`);
  }
}
