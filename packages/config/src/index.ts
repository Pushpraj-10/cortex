/**
 * @cortex/config — what the user has configured: layered settings (permissions, hooks, MCP servers)
 * and the markdown memory files that go into the system prompt.
 */

export {
  hasProjectRequests,
  loadSettings,
  mergeSettings,
  projectRequests,
  readSettingsLayers,
  type ProjectRequests,
  type Settings,
  type SettingsFile,
  type SettingsLayers,
} from "./settings.js";
export { MAX_TRUSTED_PROJECTS, fingerprintRequests, isProjectTrusted, projectKey, trustPath, trustProject } from "./trust.js";
export { loadMemory } from "./memory.js";
export { loadPreferences, preferencesPath, savePreferences, type Preferences } from "./preferences.js";
export { appendHistory, historyPath, loadHistory, MAX_HISTORY_ENTRIES, MAX_HISTORY_ENTRY_CHARS } from "./history.js";
export {
  credentialsPath,
  loadCredentials,
  removeProviderCredentials,
  saveProviderCredentials,
  type Credentials,
  type StoredProvider,
} from "./credentials.js";
