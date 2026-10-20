"use client";

import { createClient } from "./client";

export interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  birth_date: string | null; // YYYY-MM-DD
  avatar_url: string | null;
  city: string | null;
  country: string | null;
}

export interface ProfileUpdate {
  full_name?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  country?: string | null;
}

/**
 * Fetch the current user's profile row.
 * NOTE: the shared `profiles` table has NO email column — email always
 * comes from the auth session user object, never from this select.
 */
export async function fetchProfile(): Promise<UserProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, birth_date, avatar_url, city, country")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data as UserProfile;
}

/** Update the current user's profile fields. Returns an error message or null. */
export async function updateProfile(
  patch: ProfileUpdate
): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not logged in";
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);
  return error ? error.message : null;
}

/**
 * Upload a new avatar image to the user's own storage folder and return its
 * public URL. Returns { url } or { error }.
 */
export async function uploadAvatar(
  file: File
): Promise<{ url?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };
  if (!file.type.startsWith("image/")) return { error: "Not an image file" };
  if (file.size > 5 * 1024 * 1024)
    return { error: "Image must be under 5 MB" };
  const path = `${user.id}/avatar`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl };
}
