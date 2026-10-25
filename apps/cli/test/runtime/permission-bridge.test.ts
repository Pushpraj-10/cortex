import { describe, expect, it, vi } from "vitest";
import { createPermissionBridge } from "../../src/runtime/permission-bridge.js";

describe("createPermissionBridge", () => {
  it("passes a request to the registered handler and settles with the answer", async () => {
    const bridge = createPermissionBridge();
    const handler = vi.fn((request) => request.resolve(true));
    bridge.onRequest(handler);

    await expect(bridge.ask("edit_file", { path: "a.ts" })).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ toolName: "edit_file", args: { path: "a.ts" } }));
  });

  it("stays pending until the handler answers", async () => {
    const bridge = createPermissionBridge();
    let answer: ((allowed: boolean) => void) | undefined;
    bridge.onRequest((request) => {
      answer = request.resolve;
    });

    let settled: boolean | undefined;
    const pending = bridge.ask("run_command", {}).then((value) => (settled = value));
    await Promise.resolve();
    expect(settled).toBeUndefined();

    answer!(false);
    await pending;
    expect(settled).toBe(false);
  });

  it("refuses when no handler is registered, instead of hanging", async () => {
    await expect(createPermissionBridge().ask("run_command", {})).resolves.toBe(false);
  });

  it("refuses again once the handler is unregistered", async () => {
    const bridge = createPermissionBridge();
    const unregister = bridge.onRequest((request) => request.resolve(true));
    unregister();
    await expect(bridge.ask("edit_file", {})).resolves.toBe(false);
  });

  it("does not let a stale unregister remove a newer handler", async () => {
    const bridge = createPermissionBridge();
    const unregisterFirst = bridge.onRequest((request) => request.resolve(false));
    bridge.onRequest((request) => request.resolve(true));
    unregisterFirst();
    await expect(bridge.ask("edit_file", {})).resolves.toBe(true);
  });
});
