import { useEffect, useState } from "react";

/**
 * The git branch, found with `read` when the app starts and again whenever `refreshKey` changes. The agent can switch
 * branches or commit while it works, so the caller passes something that changes when a turn ends. `read` is passed in,
 * not imported, so the UI never touches the file system itself.
 */
export function useGitBranch(read: () => string | undefined, refreshKey: unknown): string | undefined {
  const [branch, setBranch] = useState(read);

  useEffect(() => {
    setBranch(read());
    // `read` is stable for the life of the app; only a finished turn should look again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return branch;
}
