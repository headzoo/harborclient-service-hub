import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRecord } from '#/db/types.js';

/**
 * Returns the authenticated user attached by the bearer auth hook.
 *
 * @param request - Incoming HTTP request after authentication.
 * @returns User record resolved from the bearer token owner.
 * @throws {Error} When the request has no authenticated user.
 */
export function requireAuthenticatedUser(request: FastifyRequest): UserRecord {
  if (!request.user) {
    throw new Error('Authenticated user is required');
  }

  return request.user;
}

/**
 * Sends a standard forbidden response for authorization failures.
 *
 * @param reply - Fastify reply used to short-circuit the handler.
 * @returns The reply instance for early return in route handlers.
 */
export function sendForbidden(reply: FastifyReply): FastifyReply {
  return reply.code(403).send({ error: 'Forbidden' });
}

/**
 * Sends forbidden when the supplied condition is false.
 *
 * @param reply - Fastify reply used to short-circuit the handler.
 * @param allowed - True when the caller may proceed.
 * @returns True when the handler should return early with 403.
 */
export function denyUnlessAllowed(reply: FastifyReply, allowed: boolean): boolean {
  if (allowed) {
    return false;
  }

  sendForbidden(reply);
  return true;
}
