import type { LlmSection } from '#/config/serverConfig.schema.js';

/**
 * Supported LLM providers exposed by Team Hub.
 */
export type LlmProvider = 'openai' | 'claude' | 'gemini';

/**
 * Normalized LLM configuration loaded from server.yaml.
 */
export interface LlmConfig {
  /**
   * Provider API keys configured on the hub.
   */
  providers: Partial<Record<LlmProvider, { apiKey: string }>>;

  /**
   * Optional allow-list of model ids the hub offers; when omitted, all catalog
   * models whose provider has a key are offered.
   */
  models?: string[];
}

/**
 * Converts a validated YAML llm section into normalized runtime config.
 *
 * @param section - Parsed llm section from server.yaml.
 * @returns Normalized LLM config for route handlers and the provider client.
 */
export function normalizeLlmConfig(section: LlmSection): LlmConfig {
  const providers: LlmConfig['providers'] = {};

  if (section.providers.openai?.apiKey) {
    providers.openai = { apiKey: section.providers.openai.apiKey };
  }
  if (section.providers.claude?.apiKey) {
    providers.claude = { apiKey: section.providers.claude.apiKey };
  }
  if (section.providers.gemini?.apiKey) {
    providers.gemini = { apiKey: section.providers.gemini.apiKey };
  }

  return {
    providers,
    ...(section.models && section.models.length > 0 ? { models: section.models } : {})
  };
}
