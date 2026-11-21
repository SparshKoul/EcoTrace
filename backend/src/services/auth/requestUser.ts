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
