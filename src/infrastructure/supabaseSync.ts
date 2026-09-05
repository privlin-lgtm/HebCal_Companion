/**
 * Supabase sync adapter.
 *
 * Records are encrypted in the browser before upload, so the server stores an
 * opaque blob. The passphrase that unlocks it is held in memory for the session
 * only and is never transmitted or persisted.
 *
 * In addition to the legacy whole-blob {@link SyncPort.push} / {@link SyncPort.pull}
 * methods (kept for backward compatibility), the adapter now exposes a
 * {@link SyncRelay} via the `relay` property and the `pushChanges` / `pullChanges`
 * methods.  The relay stores append-only, per-change encrypted rows in the
 * `sync_changes` table so the coordinator can push/pull incremental changes by
 * cursor without ever sending plaintext to the server.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  EncryptedSyncChange,
  Remembrance,
  SyncChange,
  SyncCrypto,
  SyncCursor,
  SyncPort,
  SyncRelay,
  SyncUser,
} from "../application/ports";
import { sanitizeRemembrances, type RemembranceInput } from "../domain/remembrance";
import { decryptJson, decryptSyncChange, encryptJson, encryptSyncChange } from "./crypto";

const TABLE = "remembrances";
const SYNC_TABLE = "sync_changes";
const SYNC_STORAGE_KEY = "or-zarua-last-sync";

/** Maximum characters allowed in a single relay row's `data` column. */
const MAX_RELAY_ROW_DATA = 64 * 1024;
/** Maximum rows returned in a single relay pull response. */
const RELAY_PULL_LIMIT = 100;
/** Over-fetch by one row so the caller can tell whether more rows remain. */
const RELAY_PULL_FETCH = RELAY_PULL_LIMIT + 1;

export type SupabaseSyncConfig = {
  url?: string;
  anonKey?: string;
  /** Inject a pre-built client (primarily for tests). */
  client?: SupabaseClient;
};

/** Return type of {@link createSupabaseSync}: the legacy port plus relay access. */
export type SupabaseSync = SyncPort & {
  /** Relay push: inserts encrypted change rows, ignoring duplicates. */
  pushChanges(user: SyncUser, changes: EncryptedSyncChange[]): Promise<void>;
  /** Relay pull: selects encrypted change rows after the cursor. */
  pullChanges(
    user: SyncUser,
    cursor: SyncCursor,
  ): Promise<{ cursor: SyncCursor; changes: Array<EncryptedSyncChange & { sequence: number }> }>;
  /** A {@link SyncRelay} view suitable for injection into the sync coordinator. */
  relay: SyncRelay;
  /**
   * A {@link SyncCrypto} view backed by the session passphrase held in this
   * closure. Suitable for injection into the sync coordinator so it can
   * encrypt/decrypt individual changes without ever receiving the passphrase.
   * Methods fail cleanly while locked.
   */
  crypto: SyncCrypto;
};

function readEnv(): SupabaseSyncConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  return { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY };
}

function toSyncUser(user: { id: string; email?: string | null } | null | undefined): SyncUser | null {
  return user ? { id: user.id, email: user.email ?? null } : null;
}

export function createSupabaseSync(config: SupabaseSyncConfig = readEnv()): SupabaseSync {
  const url = config.url?.trim();
  const anonKey = config.anonKey?.trim();
  const injectedClient = config.client ?? null;
  let client: SupabaseClient | null = null;
  let passphrase = "";

  function isConfigured(): boolean {
    return Boolean(url && anonKey);
  }

  function requireClient(): SupabaseClient {
    if (injectedClient) return injectedClient;
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
    if (!isConfigured() && !injectedClient) return;
    const { error } = await requireClient().auth.signOut();
    if (error) throw new Error(error.message);
  }

  async function getUser(): Promise<SyncUser | null> {
    if (!isConfigured() && !injectedClient) return null;
    const { data, error } = await requireClient().auth.getSession();
    if (error) return null;
    return toSyncUser(data.session?.user);
  }

  function onAuthChange(listener: (user: SyncUser | null) => void): () => void {
    if (!isConfigured() && !injectedClient) return () => {};
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

  // -------------------------------------------------------------------------
  // Legacy whole-blob sync (backward compatibility with SyncPort)
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Encrypted relay (SyncRelay) — append-only per-change rows
  // -------------------------------------------------------------------------

  function requireRelayConfigured(): void {
    if (!isConfigured() && !injectedClient) {
      throw new Error("Cross-device sync is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }
  }

  /**
   * Inserts encrypted change rows into `sync_changes`.
   *
   * Each row is `{ user_id, op_id, data }` where `op_id` is an opaque
   * deduplication identifier and `data` is the already-encrypted change blob.
   * Duplicate `(user_id, op_id)` pairs are silently ignored so retries are
   * idempotent.
   */
  async function pushChanges(user: SyncUser, changes: EncryptedSyncChange[]): Promise<void> {
    requireRelayConfigured();
    if (changes.length === 0) return;

    for (const change of changes) {
      if (typeof change.opId !== "string" || change.opId.length === 0 || change.opId.length > 200) {
        throw new Error("Refusing to push a change with an invalid operation id.");
      }
      if (typeof change.data !== "string" || change.data.length === 0 || change.data.length > MAX_RELAY_ROW_DATA) {
        throw new Error("Refusing to push a change with an invalid or oversized payload.");
      }
    }

    const rows = changes.map((change) => ({
      user_id: user.id,
      op_id: change.opId,
      data: change.data,
    }));

    const { error } = await requireClient()
      .from(SYNC_TABLE)
      .upsert(rows, { onConflict: "user_id,op_id", ignoreDuplicates: true });

    if (error) throw new Error(error.message);
  }

  /**
   * Selects encrypted change rows after the cursor, ordered by sequence.
   *
   * Returns at most {@link RELAY_PULL_LIMIT} rows. The returned cursor is the
   * highest sequence observed so the next pull continues from there. Returns an
   * empty `changes` array when no rows match.
   */
  async function pullChanges(
    user: SyncUser,
    cursor: SyncCursor,
  ): Promise<{ cursor: SyncCursor; changes: Array<EncryptedSyncChange & { sequence: number }> }> {
    requireRelayConfigured();

    const { data, error } = await requireClient()
      .from(SYNC_TABLE)
      .select("sequence,op_id,data")
      .eq("user_id", user.id)
      .gt("sequence", cursor.sequence)
      .order("sequence", { ascending: true })
      .limit(RELAY_PULL_FETCH);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return { cursor, changes: [] };
    }

    const rows = data.slice(0, RELAY_PULL_LIMIT);
    const changes: Array<EncryptedSyncChange & { sequence: number }> = [];

    for (const row of rows) {
      if (
        typeof row.sequence !== "number"
        || !Number.isInteger(row.sequence)
        || typeof row.op_id !== "string"
        || row.op_id.length === 0
        || row.op_id.length > 200
        || typeof row.data !== "string"
        || row.data.length === 0
        || row.data.length > MAX_RELAY_ROW_DATA
      ) {
        throw new Error("Remote sync row is malformed or oversized.");
      }
      changes.push({ opId: row.op_id, data: row.data, sequence: row.sequence });
    }

    const maxSequence = rows[rows.length - 1].sequence;
    return { cursor: { sequence: maxSequence }, changes };
  }

  const relay: SyncRelay = {
    isConfigured,
    push: pushChanges,
    pull: pullChanges,
  };

  // -------------------------------------------------------------------------
  // Coordinator crypto view — uses the closure-only session passphrase.
  //
  // The passphrase never leaves this closure. The coordinator receives these
  // wrappers and calls them without ever seeing the key. While locked (no
  // passphrase set) both methods throw cleanly so a sync cycle aborts before
  // any plaintext is produced.
  // -------------------------------------------------------------------------

  const cryptoView: SyncCrypto = {
    async encrypt(change: SyncChange): Promise<string> {
      const key = requireUnlocked();
      return encryptSyncChange(change, key);
    },
    async decrypt(payload: string): Promise<SyncChange> {
      const key = requireUnlocked();
      return decryptSyncChange(payload, key);
    },
  };

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
    pushChanges,
    pullChanges,
    relay,
    crypto: cryptoView,
  };
}
