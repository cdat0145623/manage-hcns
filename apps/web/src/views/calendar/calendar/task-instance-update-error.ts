export type TaskInstanceUpdateErrorKind =
  | "forbidden"
  | "invalid-transition"
  | "conflict"
  | "unknown";

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const data = "data" in error ? error.data : undefined;
  if (typeof data === "object" && data !== null && "code" in data) {
    return typeof data.code === "string" ? data.code : undefined;
  }

  const shape = "shape" in error ? error.shape : undefined;
  if (typeof shape !== "object" || shape === null || !("data" in shape)) {
    return undefined;
  }

  const shapeData = shape.data;
  if (
    typeof shapeData === "object" &&
    shapeData !== null &&
    "code" in shapeData
  ) {
    return typeof shapeData.code === "string" ? shapeData.code : undefined;
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return "";
  }

  return typeof error.message === "string" ? error.message.toLowerCase() : "";
}

export function classifyTaskInstanceUpdateError(
  error: unknown,
): TaskInstanceUpdateErrorKind {
  const code = getErrorCode(error);

  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return "forbidden";
  if (code === "BAD_REQUEST") return "invalid-transition";
  if (code === "CONFLICT") return "conflict";

  const message = getErrorMessage(error);
  if (message.includes("duplicate") || message.includes("unique constraint")) {
    return "conflict";
  }

  return "unknown";
}
