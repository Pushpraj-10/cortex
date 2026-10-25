import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceFiles } from "../../../src/ui/hooks/useWorkspaceFiles.js";
import { mountElement, settle } from "../support/render-frame.js";

/** A promise the test settles by hand, to control when a walk finishes. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Mounts the hook with handles to flip `wanted` and bump the refresh key, the way typing `@` and finishing a turn do. */
function mount(list: (() => Promise<string[]>) | undefined, initiallyWanted = false) {
  const handles: { files?: string[]; want?: (wanted: boolean) => void; bump?: () => void } = {};
  function Harness() {
    const [wanted, setWanted] = useState(initiallyWanted);
    const [key, setKey] = useState(0);
    handles.files = useWorkspaceFiles(list, wanted, key);
    handles.want = setWanted;
    handles.bump = () => setKey((value) => value + 1);
    return null;
  }
  const mounted = mountElement(<Harness />);
  return { handles, unmount: mounted.unmount };
}

describe("useWorkspaceFiles", () => {
  it("does not read the file system until the list is wanted", async () => {
    const list = vi.fn(async () => ["a.ts"]);
    const { handles, unmount } = mount(list);
    await settle();
    expect(list).not.toHaveBeenCalled();
    expect(handles.files).toEqual([]);
    unmount();
  });

  it("reads it once when first wanted, and returns what it found", async () => {
    const list = vi.fn(async () => ["a.ts", "src/b.ts"]);
    const { handles, unmount } = mount(list);
    handles.want!(true);
    await settle();
    expect(handles.files).toEqual(["a.ts", "src/b.ts"]);
    expect(list).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not read again when it is wanted again with nothing changed in between", async () => {
    const list = vi.fn(async () => ["a.ts"]);
    const { handles, unmount } = mount(list, true);
    await settle();
    handles.want!(false);
    await settle();
    handles.want!(true);
    await settle();
    expect(list).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("reads again the next time it is wanted after a turn finished, but not before", async () => {
    let files = ["a.ts"];
    const list = vi.fn(async () => files);
    const { handles, unmount } = mount(list, true);
    await settle();
    expect(handles.files).toEqual(["a.ts"]);

    handles.want!(false);
    await settle();
    files = ["a.ts", "new.ts"];
    handles.bump!();
    await settle();
    expect(list).toHaveBeenCalledTimes(1); // not wanted, so not read

    handles.want!(true);
    await settle();
    expect(list).toHaveBeenCalledTimes(2);
    expect(handles.files).toEqual(["a.ts", "new.ts"]);
    unmount();
  });

  it("keeps the result of a walk that was still running when the menu closed", async () => {
    const walk = deferred<string[]>();
    const list = vi.fn(() => walk.promise);
    const { handles, unmount } = mount(list, true);
    await settle();

    handles.want!(false); // the user typed on, past the @
    await settle();
    walk.resolve(["a.ts"]);
    await settle();

    expect(handles.files).toEqual(["a.ts"]);
    expect(list).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("lets a newer walk's result win when an older one finishes late", async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const list = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { handles, unmount } = mount(list, true);
    await settle();

    handles.bump!(); // a turn ended, and the list is wanted again: a second walk starts
    await settle();
    expect(list).toHaveBeenCalledTimes(2);

    second.resolve(["new.ts"]);
    await settle();
    first.resolve(["old.ts"]);
    await settle();

    expect(handles.files).toEqual(["new.ts"]);
    unmount();
  });

  it("shows no files, and does not throw, when the walk fails", async () => {
    const list = vi.fn(async () => {
      throw new Error("EACCES");
    });
    const { handles, unmount } = mount(list, true);
    await settle();
    expect(handles.files).toEqual([]);
    unmount();
  });

  it("offers nothing when no lister was given", async () => {
    const { handles, unmount } = mount(undefined, true);
    await settle();
    expect(handles.files).toEqual([]);
    unmount();
  });
});
