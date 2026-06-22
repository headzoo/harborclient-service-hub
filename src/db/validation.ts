import type { ZodError } from 'zod/v4';

/**
 * Formats the first Zod validation issue into a short user-facing message.
 *
 * @param error - Zod validation error from schema parsing.
 * @returns Human-readable error string.
 */
export function formatZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'Invalid database configuration.';
  }

  if (issue.message) {
    return issue.message;
  }

  return 'Invalid database configuration.';
}
