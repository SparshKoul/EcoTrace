import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashIp, maskIp } from "./v1Reports.js";

describe("transparent IP handling", () => {
  it("masks the last IPv4 octet", () => {
    assert.equal(maskIp("103.21.244.17"), "103.21.244.***");
  });

  it("masks an IPv6 suffix", () => {
    assert.equal(maskIp("2401:4900:1c2a:abcd::1"), "2401:4900:1c2a:***");
  });

  it("strips IPv4-mapped IPv6 before masking", () => {
    assert.equal(maskIp("::ffff:103.21.244.17"), "103.21.244.***");
  });

  it("hashes the full IP deterministically", () => {
    assert.equal(hashIp("103.21.244.17"), hashIp("103.21.244.17"));
    assert.notEqual(hashIp("103.21.244.17"), hashIp("103.21.244.18"));
    assert.equal(hashIp("103.21.244.17").length, 64);
  });
});
