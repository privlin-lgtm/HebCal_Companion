-- Encrypted sync relay schema for Or Zarua
--
-- The client encrypts each sync change (upsert or delete) with AES-GCM before
-- uploading, so Supabase stores only opaque ciphertext rows. The server never
-- sees the passphrase, the plaintext remembrance name, or the decrypted record.
--
-- This table is append-only: rows are inserted by the client and ordered by a
-- server-generated sequence so other devices can pull incrementally by cursor.
-- A unique (user_id, op_id) constraint makes duplicate uploads idempotent.
--
-- The legacy `public.remembrances` table (whole-blob sync) remains readable for
-- migration. It may be removed only after every client has successfully
-- migrated to the local-first IndexedDB store.

-- Append-only encrypted change log ------------------------------------------------

create table if not exists public.sync_changes (
  sequence bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id text not null,
  data text not null,
  created_at timestamptz not null default now(),
  unique (user_id, op_id)
);

alter table public.sync_changes enable row level security;

-- A user can only read and write their own encrypted rows.
create policy "Users manage own encrypted sync changes"
  on public.sync_changes for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for efficient cursor-based pulls: WHERE user_id = ? AND sequence > ?
-- ORDER BY sequence ASC LIMIT 100.
create index if not exists sync_changes_user_sequence
  on public.sync_changes(user_id, sequence);

-- Optional: prune old rows automatically (uncomment to enable).
-- create index if not exists sync_changes_created_at
--   on public.sync_changes(created_at);

-- Legacy whole-blob table (kept for migration) ------------------------------------
--
-- The original `public.remembrances` table stored one encrypted blob per user.
-- It is no longer written to by clients using the relay, but remains available
-- so older app versions can still read their data during the migration window.
-- Drop it only after confirming all devices have migrated:
--
-- drop table if exists public.rememembrances;
