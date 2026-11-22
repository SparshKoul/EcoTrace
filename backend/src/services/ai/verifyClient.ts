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
  status: "ACCEPTED" | "VERIFIED" | "REVIEW_REQUIRED" | "REJECTED";
  confidence: number;
  detected_classes: string[];

  /** Full microservice evidence for transparency / audit columns. */
  is_waste_detected: boolean;
  waste_category: string | null;
  detections: { label: string; class_id: number; confidence: number; bbox: number[] }[];
  privacy: { faces_blurred: number; plates_blurred: number; original_stored: boolean; processed_stored: boolean };
  siglip: { available: boolean; predicted_category: string | null; confidence: number | null };
  bedrock: { available: boolean; judgement: string | null; reason: string | null };
  decision: { result: string; confidence: number | null; reasons: string[] };
  model_versions: { detector: string | null; classifier: string | null };

  rejection_reason?: string;
  audit_summary?: string;
  category?: string;
  details?: Record<string, unknown>;
}

export interface VerifyOptions {
  reportId?: string;
  reportType?: string;
  latitude?: number;
  longitude?: number;
  mimeType?: string;
}

export class AiVerifyClient {
  private readonly baseUrl: string;
  private readonly serviceKey: string;

  constructor(baseUrl = env.AI_SERVICE_URL, serviceKey = env.INTERNAL_SERVICE_KEY ?? "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.serviceKey = serviceKey;
  }

  async toBuffer(photoDataOrUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (photoDataOrUrl.startsWith("data:")) {
      const match = photoDataOrUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return {
          mimeType: match[1],
          buffer: Buffer.from(match[2], "base64"),
        };
      }
    }

    if (photoDataOrUrl.startsWith("http://") || photoDataOrUrl.startsWith("https://")) {
      const res = await fetch(photoDataOrUrl, { signal: AbortSignal.timeout(10_000) });
      const arrayBuf = await res.arrayBuffer();
      return {
        mimeType: res.headers.get("content-type") || "image/jpeg",
        buffer: Buffer.from(arrayBuf),
      };
    }

    return {
      mimeType: "image/jpeg",
      buffer: Buffer.from(photoDataOrUrl),
    };
  }

  async verifyBuffer(
    buffer: Buffer | Uint8Array,
    mimeType = "image/jpeg",
    options: VerifyOptions = {},
  ): Promise<AiVerifyResponse> {
    const reportId = options.reportId || `ECO-${Date.now().toString(36)}`;
    const reportType = options.reportType || "garbage_dump";

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
      audit_summary: "AI service unavailable — queued for manual review.",
    };

    try {
      const form = new FormData();
      const ext = mimeType.includes("png") ? "png" : "jpg";
      form.append("file", new Blob([buffer as any], { type: mimeType }), `${reportId}.${ext}`);
      form.append("report_id", reportId);
      form.append("report_type", reportType);

      if (options.latitude !== undefined) form.append("latitude", String(options.latitude));
      if (options.longitude !== undefined) form.append("longitude", String(options.longitude));

      const headers: Record<string, string> = {
        "X-Tunnel-Skip-Anti-Abuse": "true",
        ...(this.serviceKey ? { "X-Internal-Service-Key": this.serviceKey } : {}),
      };

      const response = await fetch(`${this.baseUrl}/api/v1/verify`, {
        method: "POST",
        headers,
        body: form,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        console.warn(`[AiVerifyClient] Non-200 response (${response.status}) from AI service`);
        return fallback;
      }

      const data = (await response.json()) as any;
      if (!data.success) return fallback;

      const decisionResult = String(data.decision?.result || data.status || "").toUpperCase();
      const reasons: string[] = Array.isArray(data.decision?.reasons) ? data.decision.reasons : [];
      const reasonText = reasons.join(". ") || data.bedrock?.reason || undefined;
      const detections = Array.isArray(data.detections) ? data.detections : [];
      const category = data.siglip?.predicted_category || data.waste_category || reportType;
      const confidence =
        data.decision?.confidence ??
        data.siglip?.confidence ??
        (detections.length ? Math.max(...detections.map((d: any) => d.confidence)) : 0.85);

      const isRejected = decisionResult === "REJECTED";
      const status: "ACCEPTED" | "VERIFIED" | "REVIEW_REQUIRED" | "REJECTED" = isRejected
        ? "REJECTED"
        : decisionResult === "VERIFIED" || decisionResult === "ACCEPTED"
        ? "VERIFIED"
        : "REVIEW_REQUIRED";

      return {
        is_waste: !isRejected,
        status,
        confidence,
        detected_classes: detections.map((d: any) => d.label),
        is_waste_detected: data.is_waste_detected ?? !isRejected,
        waste_category: category,
        detections,
        privacy: data.privacy ?? { faces_blurred: 0, plates_blurred: 0, original_stored: false, processed_stored: false },
        siglip: data.siglip ?? { available: false, predicted_category: null, confidence: null },
        bedrock: data.bedrock ?? { available: false, judgement: null, reason: null },
        decision: data.decision ?? { result: decisionResult, confidence, reasons },
        model_versions: data.model_versions ?? { detector: null, classifier: null },
        rejection_reason: isRejected ? reasonText || "Image was evaluated and not recognized as outdoor waste." : undefined,
        audit_summary: reasonText || `Classified as ${category} with ${(confidence * 100).toFixed(0)}% confidence.`,
        category,
        details: data,
      };
    } catch (err) {
      console.warn("[AiVerifyClient] Error connecting to microservice, using offline review fallback:", err);
      return fallback;
    }
  }

  async verifyImage(
    image: Uint8Array | Buffer | string,
    reportId: string,
    reportType = "garbage_dump",
    mimeType = "image/jpeg",
    latitude?: number,
    longitude?: number,
  ): Promise<AiVerifyResponse> {
    if (typeof image === "string") {
      const { buffer, mimeType: parsedMime } = await this.toBuffer(image);
      return this.verifyBuffer(buffer, parsedMime || mimeType, { reportId, reportType, latitude, longitude });
    }
    return this.verifyBuffer(image, mimeType, { reportId, reportType, latitude, longitude });
  }

  async verifyPhoto(photoDataOrUrl: string, options: VerifyOptions = {}): Promise<AiVerifyResponse> {
    const { buffer, mimeType } = await this.toBuffer(photoDataOrUrl);
    return this.verifyBuffer(buffer, mimeType, options);
  }
}

export const aiVerifyClient = new AiVerifyClient();
