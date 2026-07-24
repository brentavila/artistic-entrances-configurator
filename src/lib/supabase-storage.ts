const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const bucket =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ||
  process.env.SUPABASE_STORAGE_BUCKET ||
  "artistic-entrances-doors";

export function supabasePublicUrl(objectPath: string) {
  if (!supabaseUrl) return objectPath;
  const normalized = objectPath.replace(/^\/+/, "");
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${normalized}`;
}

export function supabaseStorageConfig() {
  return { supabaseUrl, bucket };
}
