/**
 * Supabase sync adapter.
 *
 * Records are encrypted in the browser before upload, so the server stores an
 * opaque blob. The passphrase that unlocks it is held in memory for the session
 * only and is never transmitted or persisted.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Remembrance, SyncPort, SyncUser } from "../application/ports";
import { sanitizeRemembrances, type RemembranceInput } from "../domain/remembrance";
import { decryptJson, encryptJson } from "./crypto";

const TABLE = "remembrances";
const SYNC_STORAGE_KEY = "or-zarua-last-sync";

export type SupabaseSyncConfig = {
  url?: string;
  anonKey?: string;
};

function readEnv(): SupabaseSyncConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  return { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY };
}

function toSyncUser(user: { id: string; email?: string | null } | null | undefined): SyncUser | null {
  return user ? { id: user.id, email: user.email ?? null } : null;
}

export function createSupabaseSync(config: SupabaseSyncConfig = readEnv()): SyncPort {
  const url = config.url?.trim();
  const anonKey = config.anonKey?.trim();
  let client: SupabaseClient | null = null;
  let passphrase = "";

  function isConfigured(): boolean {
    return Boolean(url && anonKey);
  }

  function requireClient(): SupabaseClient {
    if (!url || !anonKey) {
      throw new Error("Cross-device sync is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }
    if (!client) {
      client = createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
    }
    return client;
  }

  async function signIn(email: string, password: string): Promise<SyncUser> {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const user = toSyncUser(data.user);
    if (!user) throw new Error("Sign-in succeeded but no account was returned.");
    return user;
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await requireClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: globalThis.location?.origin },
    });
    if (error) throw new Error(error.message);
    // Supabase returns a user with no session when email confirmation is pending.
    return { user: toSyncUser(data.user), needsConfirmation: !data.session };
  }

  async function signOut(): Promise<void> {
    passphrase = "";
    if (!isConfigured()) return;
    const { error } = await requireClient().auth.signOut();
    if (error) throw new Error(error.message);
  }

  async function getUser(): Promise<SyncUser | null> {
    if (!isConfigured()) return null;
    const { data, error } = await requireClient().auth.getSession();
    if (error) return null;
    return toSyncUser(data.session?.user);
  }

  function onAuthChange(listener: (user: SyncUser | null) => void): () => void {
    if (!isConfigured()) return () => {};
    const { data } = requireClient().auth.onAuthStateChange((_event, session) => {
      listener(toSyncUser(session?.user));
    });
    return () => data.subscription.unsubscribe();
  }

  function unlock(value: string): void {
    const trimmed = value.trim();
    if (trimmed.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
    passphrase = trimmed;
  }

  function lock(): void {
    passphrase = "";
  }

  function isUnlocked(): boolean {
    return passphrase.length > 0;
  }

  function requireUnlocked(): string {
    if (!passphrase) throw new Error("Enter your encryption passphrase first.");
    return passphrase;
  }

  async function requireUser(): Promise<SyncUser> {
    const user = await getUser();
    if (!user) throw new Error("Sign in to sync across devices.");
    return user;
  }

  async function push(remembrances: Remembrance[]): Promise<void> {
    const key = requireUnlocked();
    const user = await requireUser();
    const payload = await encryptJson(remembrances, key);
    const { error } = await requireClient().from(TABLE).upsert({
      user_id: user.id,
      data: payload,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    try {
      localStorage.setItem(SYNC_STORAGE_KEY, new Date().toISOString());
    } catch {
      /* storage unavailable — last-sync display is cosmetic */
    }
  }

  async function pull(): Promise<Remembrance[] | null> {
    const key = requireUnlocked();
    const user = await requireUser();
    const { data, error } = await requireClient()
      .from(TABLE)
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.data) return null;
    const decrypted = await decryptJson(data.data as string, key);
    if (!Array.isArray(decrypted)) throw new Error("Synced data is not a remembrance list.");
    const records = sanitizeRemembrances(decrypted as RemembranceInput[]);
    try {
      localStorage.setItem(SYNC_STORAGE_KEY, new Date().toISOString());
    } catch {
      /* storage unavailable — last-sync display is cosmetic */
    }
    return records;
  }

  function getLastSync(): string | null {
    try {
      return localStorage.getItem(SYNC_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  return {
    isConfigured,
    signIn,
    signUp,
    signOut,
    getUser,
    onAuthChange,
    unlock,
    lock,
    isUnlocked,
    push,
    pull,
    getLastSync,
  };
}
