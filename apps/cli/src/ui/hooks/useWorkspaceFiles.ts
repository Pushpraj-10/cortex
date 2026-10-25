import { useEffect, useRef, useState } from "react";

/**
 * The workspace's file list for the `@` menu. It is read when the list is first `wanted` (the user typed an `@`), not at
 * startup, so a session that never uses it never walks the tree; and again the next time it is wanted after `refreshKey`
 * changed, because the agent creates and deletes files while it works. `list` is passed in so the UI never touches the file
 * system itself; a failure leaves the menu empty rather than breaking typing.
 */
export function useWorkspaceFiles(list: (() => Promise<string[]>) | undefined, wanted: boolean, refreshKey: unknown): string[] {
  const [files, setFiles] = useState<string[]>([]);
  const loadedFor = useRef<{ key: unknown } | undefined>(undefined);
  const newest = useRef(0);

  useEffect(() => {
    if (!list || !wanted) return;
    if (loadedFor.current && Object.is(loadedFor.current.key, refreshKey)) return;

    // Claimed now, so a keystroke while the walk runs does not start a second one. A walk is never abandoned when the menu
    // closes (the list is still wanted next time); only a newer walk's result replaces an older one's.
    loadedFor.current = { key: refreshKey };
    const mine = ++newest.current;
    list().then(
      (found) => {
        if (mine === newest.current) setFiles(found);
      },
      () => {
        if (mine === newest.current) setFiles([]);
      },
    );
    // `list` is stable for the life of the app; only wanting the files or a finished turn should read them again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, refreshKey]);

  return files;
}
