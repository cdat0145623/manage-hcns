export type EditorReturnTarget =
  | "calendar"
  | "instance-detail"
  | "recurring-manager";

/**
 * Keeps the parent surface that opened the master editor explicit while the
 * editor itself is closing. Calendar owns the actual modal state changes.
 */
export function getEditorCloseDestination(
  target: EditorReturnTarget,
): EditorReturnTarget {
  return target;
}
