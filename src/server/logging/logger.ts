import winston from 'winston';
import type { LoggingConfig } from '#/config/loggingConfig.js';

/**
 * Winston logger instance used by the Team Hub server.
 */
export type Logger = winston.Logger;

/**
 * Builds a Winston logger from normalized logging configuration.
 *
 * Uses standard npm log levels. When both file and console output are disabled,
 * attaches a silent console transport so Winston does not warn about zero transports.
 *
 * @param config - Normalized logging settings from server.yaml.
 * @returns Configured Winston logger.
 */
export function createLogger(config: LoggingConfig): Logger {
  const transports: winston.transport[] = [];

  if (config.console) {
    transports.push(new winston.transports.Console());
  }

  if (config.file) {
    transports.push(new winston.transports.File({ filename: config.file }));
  }

  if (transports.length === 0) {
    transports.push(new winston.transports.Console({ silent: true }));
  }

  return winston.createLogger({
    level: config.level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports
  });
}
