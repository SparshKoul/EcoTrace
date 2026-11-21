/**
 * Dual-bucket storage port (PRD: raw-private vs sanitized-public).
 * Scaffold for the ingestion pipeline — callers should never put raw media in the public bucket.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, STORAGE_BUCKETS } from "../../db/supabase.js";

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
    .upload(path, body, { contentType, upsert: false });
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
