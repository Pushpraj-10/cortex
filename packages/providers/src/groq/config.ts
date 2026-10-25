export interface GroqConfig {
  apiKey: string;
  /** Defaults to https://api.groq.com/openai/v1. */
  baseUrl?: string;
  model: string;
}
