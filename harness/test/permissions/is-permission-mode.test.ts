import { describe, expect, it } from "vitest";
import { isPermissionMode } from "../../src/permissions/is-permission-mode";

describe("isPermissionMode", () => {
  it("accepts the four modes and rejects everything else", () => {
    for (const m of ["default", "acceptEdits", "plan", "bypassPermissions"]) expect(isPermissionMode(m)).toBe(true);
    expect(isPermissionMode("yolo")).toBe(false);
    expect(isPermissionMode(undefined)).toBe(false);
  });
});
