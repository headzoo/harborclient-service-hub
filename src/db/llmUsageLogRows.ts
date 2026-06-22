import type { LlmUsageLogRecord } from '#/db/types.js';

/**
 * SQL row shape returned by relational backends for the llm_usage_log table.
 */
export interface LlmUsageLogSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Owning user identifier column.
   */
  user_id: string;

  /**
   * API token identifier column.
   */
  api_token_id: string | null;

  /**
   * UTC calendar month key column.
   */
  period: string;

  /**
   * Provider model id column.
   */
  model: string;

  /**
   * LLM provider column.
   */
  provider: string;

  /**
   * Prompt token count column.
   */
  prompt_tokens: number;

  /**
   * Completion token count column.
   */
  completion_tokens: number;

  /**
   * Total token count column.
   */
  total_tokens: number;

  /**
   * Whether the request started a new user turn.
   */
  is_new_turn: boolean;

  /**
   * Whether the model returned tool calls.
   */
  had_tool_calls: boolean;

  /**
   * Request message count column.
   */
  message_count: number;

  /**
   * Completion timestamp column.
   */
  created_at: Date;
}

/**
 * Maps a snake_case SQL row to the shared {@link LlmUsageLogRecord} shape.
 *
 * @param row - Database row from llm_usage_log.
 * @returns Normalized usage log record for application code.
 */
export function mapLlmUsageLogSqlRow(row: LlmUsageLogSqlRow): LlmUsageLogRecord {
  return {
    id: row.id,
    userId: row.user_id,
    apiTokenId: row.api_token_id,
    period: row.period,
    model: row.model,
    provider: row.provider as LlmUsageLogRecord['provider'],
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    isNewTurn: row.is_new_turn,
    hadToolCalls: row.had_tool_calls,
    messageCount: row.message_count,
    createdAt: row.created_at
  };
}

/**
 * Column list for SELECT queries against the llm_usage_log table.
 */
export const LLM_USAGE_LOG_SELECT_COLUMNS = `id, user_id, api_token_id, period, model, provider, prompt_tokens, completion_tokens, total_tokens, is_new_turn, had_tool_calls, message_count, created_at`;
