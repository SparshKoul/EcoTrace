/**
 * Dual-bucket storage port (PRD: raw-private vs sanitized-public).
 * Scaffold for the ingestion pipeline — callers should never put raw media in the public bucket.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseConfigured, STORAGE_BUCKETS } from "../../db/supabase.js";

type StorageBucket = ReturnType<SupabaseClient["storage"]["from"]>;
type UploadBody = Parameters<StorageBucket["upload"]>[1];

async function upload(
  bucket: string,
  path: string,
  body: UploadBody,
  contentType: string,
): Promise<{ path: string; fullPath: string }> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(bucket)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw error;
  return { path: data.path, fullPath: data.fullPath };
}

/** Private bucket — unblurred uploads land here and never leave the server. */
export function uploadRaw(path: string, body: UploadBody, contentType: string) {
  return upload(STORAGE_BUCKETS.raw, path, body, contentType);
}

/** Public bucket — only PII-blurred, verified media belongs here. */
export function uploadSanitized(path: string, body: UploadBody, contentType: string) {
  return upload(STORAGE_BUCKETS.public, path, body, contentType);
}

export function getSanitizedPublicUrl(path: string): string {
  return getSupabaseAdmin().storage.from(STORAGE_BUCKETS.public).getPublicUrl(path).data.publicUrl;
}

/**
 * Persists an incoming photo (data URL, base64 or remote URL) to Supabase Storage
 * and returns the public CDN URL. If storage is unconfigured or fails, returns the
 * original string gracefully.
 */
export async function persistPhoto(photoDataOrUrl: string, folder = "reports"): Promise<string> {
  if (!photoDataOrUrl || !photoDataOrUrl.startsWith("data:")) {
    return photoDataOrUrl;
  }

  if (!isSupabaseConfigured()) {
    return photoDataOrUrl;
  }

  try {
    const match = photoDataOrUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return photoDataOrUrl;

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");

    let ext = "jpg";
    if (mimeType.includes("png")) ext = "png";
    else if (mimeType.includes("webp")) ext = "webp";
    else if (mimeType.includes("webm")) ext = "webm";
    else if (mimeType.includes("mp4")) ext = "mp4";

    const fileName = `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;
    const filePath = `${folder}/${fileName}`;

    await uploadSanitized(filePath, buffer, mimeType);
    return getSanitizedPublicUrl(filePath);
  } catch (err: unknown) {
    console.warn("Could not upload photo to Supabase storage, using fallback:", err);
    return photoDataOrUrl;
  }
}
