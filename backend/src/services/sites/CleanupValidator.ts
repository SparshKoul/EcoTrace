/**
 * Phase 3.5 — before/after cleanup validation.
 * Calls the AI microservice when available; otherwise applies a deterministic offline sanity check.
 * The AI service is authoritative for waste-removal confidence when it responds.
 */

import { env } from "../../config/env.js";

export interface CleanupValidationInput {
  readonly siteId: string;
  readonly beforePhotoUrl?: string | null;
  readonly afterPhotoUrl: string;
  readonly distanceM?: number;
  readonly confidence?: number;
}

export interface CleanupValidationResult {
  readonly accepted: boolean;
  readonly confidence: number;
  readonly reason: string;
  readonly source: "ai" | "offline-check";
}

export interface CleanupValidator {
  validate(input: CleanupValidationInput): Promise<CleanupValidationResult>;
}

export class HttpCleanupValidator implements CleanupValidator {
  constructor(private readonly baseUrl = env.AI_SERVICE_URL) {}

  async validate(input: CleanupValidationInput): Promise<CleanupValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/internal/cleanup/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: input.siteId,
          before_photo_url: input.beforePhotoUrl ?? null,
          after_photo_url: input.afterPhotoUrl,
          distance_m: input.distanceM ?? null,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = (await response.json()) as Partial<CleanupValidationResult>;
        return {
          accepted: data.accepted === true,
          confidence: Number(data.confidence ?? 0),
          reason: String(data.reason ?? "ai-validation"),
          source: "ai",
        };
      }
    } catch {
      // fall through to the offline check
    }

    const samePhoto = input.beforePhotoUrl && input.beforePhotoUrl === input.afterPhotoUrl;
    const accepted = !samePhoto;
    return {
      accepted,
      confidence: accepted ? Number(input.confidence ?? 0.85) : 0,
      reason: samePhoto ? "after_photo_matches_before_photo" : "offline_sanity_check",
      source: "offline-check",
    };
  }
}

export const cleanupValidator = new HttpCleanupValidator();
