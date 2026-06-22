import type { LlmUsageRecord } from '#/db/types.js';

/**
 * SQL row shape returned by relational backends for the llm_usage table.
 */
export interface LlmUsageSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Owning user identifier column.
   */
  user_id: string;

  /**
   * UTC calendar month key column.
   */
  period: string;

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
   * Last update timestamp column.
   */
  updated_at: Date;
}

/**
 * Maps a snake_case SQL row to the shared {@link LlmUsageRecord} shape.
 *
 * @param row - Database row from llm_usage.
 * @returns Normalized usage record for application code.
 */
export function mapLlmUsageSqlRow(row: LlmUsageSqlRow): LlmUsageRecord {
  return {
    id: row.id,
    userId: row.user_id,
    period: row.period,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    updatedAt: row.updated_at
  };
}

/**
 * Column list for SELECT queries against the llm_usage table.
 */
export const LLM_USAGE_SELECT_COLUMNS = `id, user_id, period, prompt_tokens, completion_tokens, total_tokens, updated_at`;
