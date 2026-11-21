/** Supabase-backed account routes: sign up, sign in, session lookup, sign out. */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AuthError, getUserFromToken, signIn, signOut, signUp } from "../services/auth/AuthService.js";
import { bearerToken } from "../services/auth/requestUser.js";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().max(120).optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/signup", async (request, reply) => {
    const parsed = signUpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    try {
      const result = await signUp(parsed.data.email, parsed.data.password, parsed.data.fullName);
      return reply.status(201).send(result);
    } catch (cause) {
      const error = cause as AuthError;
      return reply.status(error.statusCode ?? 400).send({ error: error.message });
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = signInSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.format() });
    }
    try {
      return reply.send(await signIn(parsed.data.email, parsed.data.password));
    } catch (cause) {
      const error = cause as AuthError;
      return reply.status(error.statusCode ?? 401).send({ error: error.message });
    }
  });

  app.get("/auth/me", async (request, reply) => {
    const token = bearerToken(request);
    if (!token) return reply.status(401).send({ error: "Authentication required" });
    try {
      return reply.send(await getUserFromToken(token));
    } catch (cause) {
      const error = cause as AuthError;
      return reply.status(error.statusCode ?? 401).send({ error: error.message });
    }
  });

  app.post("/auth/signout", async (request, reply) => {
    const token = bearerToken(request);
    if (!token) return reply.status(401).send({ error: "Authentication required" });
    try {
      await signOut(token);
      return reply.send({ success: true });
    } catch (cause) {
      const error = cause as AuthError;
      return reply.status(error.statusCode ?? 400).send({ error: error.message });
    }
  });
};
