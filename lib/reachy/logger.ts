type LogFields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", scope: string, message: string, fields?: LogFields) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string) {
  return {
    info: (message: string, fields?: LogFields) => emit("info", scope, message, fields),
    warn: (message: string, fields?: LogFields) => emit("warn", scope, message, fields),
    error: (message: string, fields?: LogFields) => emit("error", scope, message, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;
