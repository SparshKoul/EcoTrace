/** Phase 5.4 — safe SVG share card and share text. All dynamic text is XML-escaped. */

export interface ShareCardData {
  readonly siteId: string;
  readonly status: string;
  readonly severity: number;
  readonly reportCount: number;
  readonly areaLabel?: string;
  readonly beforePhotoUrl?: string | null;
  readonly afterPhotoUrl?: string | null;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildShareText(data: ShareCardData): string {
  const area = data.areaLabel ? ` in ${data.areaLabel}` : "";
  return `EcoTrace verified waste site ${data.siteId}${area}: ${data.reportCount} reports, severity ${data.severity}/100, currently ${data.status}. Track the cleanup on EcoTrace.`;
}

export function buildShareCardSvg(data: ShareCardData): string {
  const status = escapeXml(data.status.toUpperCase());
  const siteId = escapeXml(data.siteId);
  const area = escapeXml(data.areaLabel ?? "Verified civic report");
  const before = data.beforePhotoUrl ? escapeXml(data.beforePhotoUrl) : "";
  const after = data.afterPhotoUrl ? escapeXml(data.afterPhotoUrl) : "";
  const badge = data.status === "cleaned" ? "#0b7a73" : "#c5221f";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img">',
    '<rect width="1200" height="630" fill="#fbf6ee"/>',
    `<rect x="0" y="0" width="1200" height="14" fill="${badge}"/>`,
    '<text x="64" y="110" font-family="sans-serif" font-size="34" font-weight="700" fill="#221c15">EcoTrace · Civic Waste Action</text>',
    `<text x="64" y="190" font-family="sans-serif" font-size="52" font-weight="700" fill="#221c15">${area}</text>`,
    `<text x="64" y="252" font-family="sans-serif" font-size="26" fill="#5f5446">Site ${siteId} · severity ${data.severity}/100 · ${data.reportCount} reports</text>`,
    `<rect x="64" y="300" width="190" height="58" rx="29" fill="${badge}"/>`,
    `<text x="159" y="338" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="700" fill="#fff">${status}</text>`,
    before ? `<image href="${before}" x="64" y="390" width="500" height="180" preserveAspectRatio="xMidYMid slice"/>` : '<rect x="64" y="390" width="500" height="180" rx="16" fill="#f4ecdf"/>',
    after ? `<image href="${after}" x="636" y="390" width="500" height="180" preserveAspectRatio="xMidYMid slice"/>` : '<rect x="636" y="390" width="500" height="180" rx="16" fill="#f4ecdf"/>',
    '<text x="64" y="608" font-family="sans-serif" font-size="20" fill="#5f5446">Before</text>',
    '<text x="636" y="608" font-family="sans-serif" font-size="20" fill="#5f5446">After (sanitized)</text>',
    '</svg>',
  ].join("");
}
