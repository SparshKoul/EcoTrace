import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyRequest } from "fastify";
import { bearerToken } from "./requestUser.js";

const requestWith = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as FastifyRequest;

describe("auth bearer token", () => {
  it("extracts a bearer token", () => {
    assert.equal(bearerToken(requestWith("Bearer abc.def.ghi")), "abc.def.ghi");
    assert.equal(bearerToken(requestWith("bearer abc")), "abc");
  });

  it("ignores missing or non-bearer headers", () => {
    assert.equal(bearerToken(requestWith()), null);
    assert.equal(bearerToken(requestWith("Basic abc")), null);
    assert.equal(bearerToken(requestWith("Bearer")), null);
  });
});
