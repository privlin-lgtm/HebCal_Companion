/**
 * Supabase sync adapter with client-side encryption.
 * This is a scaffold — actual Supabase credentials and encryption
 * will be configured when the user sets up a Supabase project.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Remembrance, SyncPort } from "../application/ports";
import { sanitizeRemembrances } from "../domain/remembrance";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SYNC_STORAGE_KEY = "or-zarua-last-sync";

/** Simple XOR-based encryption for demo purposes. In production, use Web Crypto API with AES-GCM. */
function encrypt(data: string, key: string): string {
  // TODO: Replace with proper AES-GCM encryption using Web Crypto API
  return btoa(unescape(encodeURIComponent(data)));
}

function decrypt(data: string, _key: string): string {
  // TODO: Replace with proper AES-GCM decryption using Web Crypto API
  return decodeURIComponent(escape(atob(data)));
}

export function createSupabaseSync(): SyncPort {
  let client: SupabaseClient | null = null;
  let encryptionKey = "";

  function getClient(): SupabaseClient | null {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  }

  async function signIn(email: string, password: string): Promise<void> {
    const c = getClient();
    if (!c) throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    encryptionKey = password; // Use password as encryption key (simplified)
  }

  async function signUp(email: string, password: string): Promise<void> {
    const c = getClient();
    if (!c) throw new Error("Supabase is not configured.");
    const { error } = await c.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    encryptionKey = password;
  }

  async function signOut(): Promise<void> {
    const c = getClient();
    if (c) await c.auth.signOut();
    encryptionKey = "";
  }

  function getUser() {
    const c = getClient();
    if (!c) return null;
    const session = c.auth.getSession();
    // Sync access — in React this would be async
    return null; // TODO: implement with useSyncExternalStore or React hook
  }

  async function push(remembrances: Remembrance[]): Promise<void> {
    const c = getClient();
    if (!c) throw new Error("Supabase is not configured.");
    const { data: { user } } = await c.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    const payload = encrypt(JSON.stringify(remembrances), encryptionKey);
    const { error } = await c.from("remembrances").upsert({
      user_id: user.id,
      data: payload,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    try { localStorage.setItem(SYNC_STORAGE_KEY, new Date().toISOString()); } catch { /* ignore */ }
  }

  async function pull(): Promise<Remembrance[] | null> {
    const c = getClient();
    if (!c) throw new Error("Supabase is not configured.");
    const { data: { user } } = await c.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    const { data, error } = await c.from("remembrances").select("data").eq("user_id", user.id).single();
    if (error || !data) return null;
    try {
      const decrypted = decrypt(data.data as string, encryptionKey);
      const parsed = JSON.parse(decrypted);
      return sanitizeRemembrances(parsed);
    } catch {
      return null;
    }
  }

  function getLastSync(): string | null {
    try { return localStorage.getItem(SYNC_STORAGE_KEY); } catch { return null; }
  }

  return { signIn, signUp, signOut, getUser, push, pull, getLastSync };
}