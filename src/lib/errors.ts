type ErrorRecord = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function textField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message.trim() || fallback;
  }

  if (typeof error === "string") {
    return error.trim() || fallback;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as ErrorRecord;
    const message = textField(record.message);
    const code = textField(record.code);
    const details = textField(record.details);
    const hint = textField(record.hint);
    const status =
      typeof record.status === "number" || typeof record.status === "string"
        ? String(record.status)
        : typeof record.statusCode === "number" ||
            typeof record.statusCode === "string"
          ? String(record.statusCode)
          : "";
    const lines = [
      message,
      code ? `code: ${code}` : "",
      details ? `details: ${details}` : "",
      hint ? `hint: ${hint}` : "",
      status ? `status: ${status}` : "",
    ].filter(Boolean);

    if (lines.length > 0) return lines.join("\n");

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Fall through to the user-facing fallback for non-serializable values.
    }
  }

  return fallback;
}

export function toAppError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error;
  return new Error(formatErrorMessage(error, fallback));
}
