import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useGitBranch } from "../../../src/ui/hooks/useGitBranch.js";
import { mountElement, settle } from "../support/render-frame.js";

/** Mounts the hook with a branch that the test can change, and a key it can bump the way a finished turn would. */
function mount(read: () => string | undefined) {
  const handles: { branch?: string | undefined; bump?: () => void } = {};
  function Harness() {
    const [key, setKey] = useState(0);
    handles.branch = useGitBranch(read, key);
    handles.bump = () => setKey((value) => value + 1);
    return null;
  }
  const mounted = mountElement(<Harness />);
  return { handles, unmount: mounted.unmount };
}

describe("useGitBranch", () => {
  it("reads the branch when it starts", () => {
    const { handles, unmount } = mount(() => "main");
    expect(handles.branch).toBe("main");
    unmount();
  });

  it("is undefined outside a repository", () => {
    const { handles, unmount } = mount(() => undefined);
    expect(handles.branch).toBeUndefined();
    unmount();
  });

  it("looks again when the key changes, so a branch the agent switched to shows up", async () => {
    let branch: string | undefined = "main";
    const { handles, unmount } = mount(() => branch);
    expect(handles.branch).toBe("main");

    branch = "feature/x";
    handles.bump!();
    await settle();

    expect(handles.branch).toBe("feature/x");
    unmount();
  });

  it("does not look again on its own: only a changed key does", async () => {
    const read = vi.fn(() => "main");
    const { handles, unmount } = mount(read);
    await settle();
    await settle();
    expect(read).toHaveBeenCalledTimes(2); // once for the initial state, once for the first effect run
    handles.bump!();
    await settle();
    expect(read).toHaveBeenCalledTimes(3);
    unmount();
  });
});
