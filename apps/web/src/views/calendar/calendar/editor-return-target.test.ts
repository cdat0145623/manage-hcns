import { describe, expect, it } from "vitest";

import { getEditorCloseDestination } from "./editor-return-target";

describe("getEditorCloseDestination", () => {
  it("returns to the instance detail modal after editing from an instance", () => {
    expect(getEditorCloseDestination("instance-detail")).toBe(
      "instance-detail",
    );
  });

  it("returns to recurring task management after editing from that list", () => {
    expect(getEditorCloseDestination("recurring-manager")).toBe(
      "recurring-manager",
    );
  });

  it("leaves the calendar unchanged when no parent modal opened the editor", () => {
    expect(getEditorCloseDestination("calendar")).toBe("calendar");
  });
});
