/** Shared Bearer-token helper for routes that can use an authenticated user. */

import type { FastifyRequest } from "fastify";
import { getUserFromToken, type AuthUser } from "./AuthService.js";

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/** Returns the Supabase user for a request, or null when no valid token is supplied. */
export async function getRequestUser(request: FastifyRequest): Promise<AuthUser | null> {
  const token = bearerToken(request);
  if (!token) return null;
  try {
    return await getUserFromToken(token);
  } catch {
    return null;
  }
}

/**
 * Enforces a valid Supabase session on a write route and returns the authenticated user.
 * Spoofable `userId` body fields / `x-user-id` headers are no longer accepted anywhere.
 */
export async function requireUser(request: FastifyRequest): Promise<AuthUser> {
  const user = await getRequestUser(request);
  if (!user) {
    const error = new Error("Authentication required. Sign in to continue.") as Error & {
      statusCode?: number;
    };
    error.statusCode = 401;
    throw error;
  }
  return user;
}

/** Fastify error handler helper: maps thrown auth errors onto the HTTP response. */
export function authErrorStatusCode(error: unknown): number {
  const statusCode = (error as { statusCode?: number }).statusCode;
  return typeof statusCode === "number" ? statusCode : 500;
}
