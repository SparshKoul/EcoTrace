import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildShareCardSvg, buildShareText, escapeXml } from "./ShareCard.js";

const data = {
  siteId: "site-1",
  status: "cleaned",
  severity: 82,
  reportCount: 14,
  areaLabel: "Rajpura & <Ward>",
  beforePhotoUrl: "https://example.com/a.jpg?x=1&y=2",
  afterPhotoUrl: null,
};

describe("share cards (Phase 5.4)", () => {
  it("escapes XML special characters", () => {
    assert.equal(escapeXml(`a&b<"c"'d`), "a&amp;b&lt;&quot;c&quot;&apos;d");
  });

  it("builds an SVG card containing the site state", () => {
    const svg = buildShareCardSvg(data);
    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /site-1/);
    assert.match(svg, /CLEANED/);
    assert.match(svg, /Rajpura &amp; &lt;Ward&gt;/);
    assert.match(svg, /x=1&amp;y=2/);
  });

  it("builds share text without auto-sending", () => {
    assert.match(buildShareText(data), /14 reports/);
    assert.match(buildShareText(data), /severity 82\/100/);
  });
});
