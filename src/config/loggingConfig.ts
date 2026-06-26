import type { LoggingSection } from '#/config/serverConfig.schema.js';

/**
 * Supported log levels for Team Hub.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Normalized logging configuration loaded from server.yaml.
 */
export interface LoggingConfig {
  /**
   * Minimum severity written to configured transports.
   */
  level: LogLevel;

  /**
   * Optional file path for log output; null when file logging is disabled.
   */
  file: string | null;

  /**
   * When true, log messages are also written to the terminal.
   */
  console: boolean;
}

/**
 * Default logging settings applied when the `logging` section is omitted.
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: 'info',
  file: null,
  console: true
};

/**
 * Converts a validated YAML logging section into normalized runtime config.
 *
 * @param section - Parsed logging section from server.yaml, when present.
 * @returns Normalized logging config with defaults applied for omitted fields.
 */
export function normalizeLoggingConfig(section?: LoggingSection): LoggingConfig {
  return {
    level: section?.level ?? DEFAULT_LOGGING_CONFIG.level,
    file: section?.file ?? DEFAULT_LOGGING_CONFIG.file,
    console: section?.console ?? DEFAULT_LOGGING_CONFIG.console
  };
}
