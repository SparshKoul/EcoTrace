/**
 * Client for the EcoTrace AI/ML microservice (`microservice/` FastAPI stack).
 *
 * POST /api/v1/verify runs the full pipeline: upload validation, optional
 * Rekognition, privacy blur (faces/plates), YOLO26 detection, SigLIP 2
 * zero-shot classification and the rule-based decision engine.
 *
 * The caller receives a normalised legacy shape so existing routes keep
 * working, plus the full evidence payload for transparency fields.
 */

import { env } from "../../config/env.js";

export interface AiVerifyResponse {
  /** Normalised legacy fields (used by /api/reports). */
  is_waste: boolean;
  confidence: number;
  detected_classes: string[];
  /** Full microservice evidence for transparency / audit columns. */
  status: "ACCEPTED" | "REJECTED" | "REVIEW_REQUIRED";
  is_waste_detected: boolean;
  waste_category: string | null;
  detections: { label: string; class_id: number; confidence: number; bbox: number[] }[];
  privacy: { faces_blurred: number; plates_blurred: number; original_stored: boolean; processed_stored: boolean };
  siglip: { available: boolean; predicted_category: string | null; confidence: number | null };
  bedrock: { available: boolean; judgement: string | null; reason: string | null };
  decision: { result: string; confidence: number | null; reasons: string[] };
  model_versions: { detector: string | null; classifier: string | null };
}

export class AiVerifyClient {
  private readonly baseUrl: string;
  private readonly serviceKey: string;

  constructor(baseUrl = env.AI_SERVICE_URL, serviceKey = env.INTERNAL_SERVICE_KEY ?? "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.serviceKey = serviceKey;
  }

  /**
   * Verifies an image for the report pipeline. Accepts raw bytes (preferred —
   * the service runs vision models directly on the image) or a data URL.
   */
  async verifyImage(
    image: Uint8Array | string,
    reportId: string,
    reportType = "garbage_dump",
    mimeType = "image/jpeg",
  ): Promise<AiVerifyResponse> {
    const fallback: AiVerifyResponse = {
      is_waste: true,
      confidence: 0.5,
      detected_classes: ["fallback_unverified_waste"],
      status: "REVIEW_REQUIRED",
      is_waste_detected: true,
      waste_category: reportType,
      detections: [],
      privacy: { faces_blurred: 0, plates_blurred: 0, original_stored: false, processed_stored: false },
      siglip: { available: false, predicted_category: null, confidence: null },
      bedrock: { available: false, judgement: null, reason: null },
      decision: {
        result: "REVIEW_REQUIRED",
        confidence: null,
        reasons: ["AI service unavailable — queued for manual review"],
      },
      model_versions: { detector: null, classifier: null },
    };

    try {
      const form = new FormData();
      if (typeof image === "string") {
        // Data URL → decode to bytes so the service can run inference.
        const match = image.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return fallback;
        const bytes = Buffer.from(match[2], "base64");
        form.append("file", new Blob([bytes], { type: match[1] }), `${reportId}.jpg`);
      } else {
        form.append("file", new Blob([new Uint8Array(image)], { type: mimeType }), `${reportId}.jpg`);
      }
      form.append("report_id", reportId);
      form.append("report_type", reportType);

      const response = await fetch(`${this.baseUrl}/api/v1/verify`, {
        method: "POST",
        headers: this.serviceKey ? { "X-Internal-Service-Key": this.serviceKey } : {},
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) return fallback;

      const data = (await response.json()) as {
        success: boolean;
        status: string;
        is_waste_detected: boolean;
        waste_category: string | null;
        detections: AiVerifyResponse["detections"];
        privacy: AiVerifyResponse["privacy"];
        siglip: AiVerifyResponse["siglip"];
        bedrock: AiVerifyResponse["bedrock"];
        decision: AiVerifyResponse["decision"];
        model_versions: AiVerifyResponse["model_versions"];
      };
      if (!data.success) return fallback;

      // Normalise to the legacy shape. Only ACCEPTED counts as fully verified;
      // REVIEW_REQUIRED still flags AI evidence for the human-in-the-loop flow.
      const confidence =
        data.decision.confidence ??
        data.siglip.confidence ??
        (data.detections.length ? Math.max(...data.detections.map((d) => d.confidence)) : 0);
      return {
        is_waste: data.is_waste_detected,
        confidence,
        detected_classes: data.detections.map((d) => d.label),
        status: data.status as AiVerifyResponse["status"],
        is_waste_detected: data.is_waste_detected,
        waste_category: data.waste_category,
        detections: data.detections,
        privacy: data.privacy,
        siglip: data.siglip,
        bedrock: data.bedrock,
        decision: data.decision,
        model_versions: data.model_versions,
      };
    } catch {
      // Offline development: the report is kept, flagged for manual review.
      return fallback;
    }
  }

  /** Legacy URL-based entry point retained for existing callers. */
  async verifyPhoto(photoUrl: string, reportId = `url-${Date.now()}`): Promise<AiVerifyResponse> {
    return this.verifyImage(photoUrl, reportId, "garbage_dump");
  }
}

export const aiVerifyClient = new AiVerifyClient();
