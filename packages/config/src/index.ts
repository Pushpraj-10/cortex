/**
 * @cortex/config — what the user has configured: layered settings (permissions, hooks, MCP servers)
 * and the markdown memory files that go into the system prompt.
 */

export { loadSettings, type Settings } from "./settings.js";
export { loadMemory } from "./memory.js";
export { loadPreferences, preferencesPath, savePreferences, type Preferences } from "./preferences.js";
export {
  credentialsPath,
  loadCredentials,
  removeProviderCredentials,
  saveProviderCredentials,
  type Credentials,
  type StoredProvider,
} from "./credentials.js";
