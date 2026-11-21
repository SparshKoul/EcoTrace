/** Phase 4.3 — deterministic, non-hallucinating offline note briefing. */

export interface CitizenNote {
  readonly id: string;
  readonly siteId: string;
  readonly userId?: string;
  readonly content: string;
  readonly createdAt: string;
}

export function buildOfflineSummary(notes: readonly CitizenNote[], maxNotes = 5, maxChars = 220): string {
  if (notes.length === 0) return "No citizen observations have been recorded yet.";
  const lines = notes.slice(0, maxNotes).map((note, index) => {
    const text = note.content.replace(/\s+/g, " ").trim();
    const clipped = text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
    return `${index + 1}. ${clipped}`;
  });
  const remaining = notes.length - lines.length;
  return [
    `Briefing from ${notes.length} citizen observation${notes.length === 1 ? "" : "s"}:`,
    ...lines,
    ...(remaining > 0 ? [`…and ${remaining} more observation${remaining === 1 ? "" : "s"}.`] : []),
  ].join("\n");
}
