import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { InvalidArgumentError } from 'commander';

/**
 * Expands a leading `~` or `~/` in a path to the user's home directory.
 *
 * @param value - Raw path string from CLI input.
 * @returns Absolute or unchanged path after home expansion.
 */
export function expandHome(value: string): string {
  if (value === '~') {
    return homedir();
  }
  if (value.startsWith('~/')) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

/**
 * Parses and validates a TCP port number from CLI input.
 *
 * @param value - Port string from a Commander option or argument.
 * @returns Valid port in the range 1–65535.
 * @throws {InvalidArgumentError} When the value is not a valid port.
 */
export function parsePort(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new InvalidArgumentError('Port must be an integer between 1 and 65535.');
  }

  const port = Number.parseInt(trimmed, 10);
  if (port < 1 || port > 65535) {
    throw new InvalidArgumentError('Port must be an integer between 1 and 65535.');
  }
  return port;
}

/**
 * Parses and validates a bind host from CLI input.
 *
 * @param value - Host string from a Commander option or argument.
 * @returns Trimmed non-empty host.
 * @throws {InvalidArgumentError} When the host is empty after trimming.
 */
export function parseHost(value: string): string {
  const host = value.trim();
  if (!host) {
    throw new InvalidArgumentError('Host must not be empty.');
  }
  return host;
}

/**
 * Validates a data directory path, allowing creation under a writable parent.
 *
 * @param value - Data directory path (may use `~` expansion).
 * @returns Resolved absolute path to an existing or creatable directory.
 * @throws {InvalidArgumentError} When the path is invalid or not writable.
 */
export function parseDataDir(value: string): string {
  const expanded = expandHome(value.trim());
  if (!expanded) {
    throw new InvalidArgumentError('Data directory path must not be empty.');
  }

  if (existsSync(expanded)) {
    const stat = statSync(expanded);
    if (!stat.isDirectory()) {
      throw new InvalidArgumentError(`Data directory is not a directory: ${expanded}`);
    }
    return expanded;
  }

  const parent = path.dirname(expanded);
  if (!existsSync(parent)) {
    throw new InvalidArgumentError(`Parent directory does not exist: ${parent}`);
  }

  try {
    accessSync(parent, constants.W_OK);
  } catch {
    throw new InvalidArgumentError(`Cannot create data directory under ${parent}`);
  }

  return expanded;
}

/**
 * Returns the default Service Hub data directory path.
 *
 * @returns Validated path to `~/.service-hub`.
 * @throws {InvalidArgumentError} When the default path cannot be used.
 */
export function defaultDataDir(): string {
  return parseDataDir('~/.service-hub');
}
