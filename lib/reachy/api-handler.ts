import { NextResponse } from "next/server";
import { toApiError } from "./errors";
import { createLogger } from "./logger";

const logger = createLogger("api");

export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const { status, body } = toApiError(error);
      if (status >= 500) {
        logger.error("Unhandled API error", { error: String(error) });
      }
      return NextResponse.json(body, { status });
    }
  };
}
