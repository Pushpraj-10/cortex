import { PERMISSION_MODES, type PermissionMode } from "./types";

export function isPermissionMode(value: unknown): value is PermissionMode {
  return (PERMISSION_MODES as readonly unknown[]).includes(value);
}
