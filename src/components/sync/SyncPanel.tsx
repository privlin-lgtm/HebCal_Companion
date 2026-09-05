import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../hooks/useToast";
import type { Remembrance, SyncStatus, SyncUser } from "../../application/ports";

type Props = {
  records: Remembrance[];
  onMerged: () => void | Promise<void>;
};

const inputClass = "w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark";
const buttonClass = "rounded-lg border border-[#bfc5c0] bg-white px-4 py-2 font-sans text-sm font-bold text-ink hover:bg-warm disabled:opacity-50 dark:border-line-dark dark:bg-warm-dark dark:text-ink-dark";
const primaryClass = "rounded-lg bg-orange px-4 py-2 font-sans text-sm font-bold text-white hover:bg-orange-dark disabled:opacity-50";

/** Maps coordinator status to a translated label. `disabled` is never shown
 *  because the panel is hidden entirely when Supabase is not configured. */
function statusLabel(status: SyncStatus): string {
  switch (status) {
    case "syncing":
    case "queued":
      return "sync.status.syncing";
    case "error":
      return "sync.status.error";
    case "locked":
      return "sync.status.locked";
    case "idle":
      return "sync.status.synced";
    default:
      return "sync.status.idle";
  }
}

export function SyncPanel({ onMerged }: Props) {
  const { t } = useTranslation();
  const { sync, syncCoordinator } = useApp();
  const { showToast } = useToast();
  const configured = sync.isConfigured();

  const [user, setUser] = useState<SyncUser | null>(null);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>(syncCoordinator.getStatus());

  useEffect(() => {
    if (!configured) return;
    sync.getUser().then(setUser).catch(() => setUser(null));
    setUnlocked(sync.isUnlocked());
    setLastSync(sync.getLastSync());
    return sync.onAuthChange((next) => {
      setUser(next);
      if (!next) setUnlocked(false);
    });
  }, [configured, sync]);

  // Subscribe to coordinator status so the badge reflects automatic cycles.
  useEffect(() => {
    if (!configured) return;
    setStatus(syncCoordinator.getStatus());
    return syncCoordinator.subscribe(() => setStatus(syncCoordinator.getStatus()));
  }, [configured, syncCoordinator]);

  if (!configured) return null;

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signUp") {
        const result = await sync.signUp(email.trim(), password);
        if (result.needsConfirmation) showToast(t("sync.confirmEmail"));
        else setUser(result.user);
      } else {
        setUser(await sync.signIn(email.trim(), password));
      }
      setPassword("");
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  function handleUnlock(e: FormEvent) {
    e.preventDefault();
    try {
      sync.unlock(passphrase);
      setUnlocked(true);
      setPassphrase("");
      showToast(t("sync.unlocked"));
      void syncCoordinator.syncNow();
    } catch (err) {
      showToast((err as Error).message, true);
    }
  }

  async function handleSyncNow() {
    setBusy(true);
    try {
      await syncCoordinator.syncNow();
      const err = syncCoordinator.getLastError();
      if (err) {
        // The coordinator stores only exception messages, never the passphrase
        // or decrypted payload, so surfacing the last error is safe.
        showToast(t("sync.syncFailed", { error: err }), true);
      } else if (syncCoordinator.getStatus() === "idle") {
        showToast(t("sync.synced", { time: new Date().toLocaleTimeString() }));
      }
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await sync.signOut();
      setUser(null);
      setUnlocked(false);
    } catch (err) {
      showToast((err as Error).message, true);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-line bg-warm p-6 dark:border-line-dark dark:bg-warm-dark">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-lg font-normal tracking-tight">{t("sync.title")}</h3>
          <p className="m-0 mt-1 max-w-[52ch] font-sans text-xs leading-relaxed text-muted">{t("sync.description")}</p>
        </div>
        <span className="rounded-full bg-[#faecda] px-2.5 py-1 font-sans text-xs font-bold text-orange-dark dark:bg-orange/20">
          {t("sync.encrypted")}
        </span>
      </div>

      {!user ? (
        <form onSubmit={handleAuth} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="sync-email" className="mb-1 block font-sans text-xs font-bold text-[#46555b]">{t("sync.email")}</label>
            <input id="sync-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="sync-password" className="mb-1 block font-sans text-xs font-bold text-[#46555b]">{t("sync.password")}</label>
            <input id="sync-password" type="password" required minLength={6} autoComplete={mode === "signUp" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-2">
            <button type="submit" disabled={busy} className={primaryClass}>
              {busy ? t("sync.working") : mode === "signUp" ? t("sync.signUp") : t("sync.signIn")}
            </button>
            <button type="button" onClick={() => setMode(mode === "signUp" ? "signIn" : "signUp")} className="font-sans text-xs font-bold text-orange hover:text-orange-dark">
              {mode === "signUp" ? t("sync.haveAccount") : t("sync.needAccount")}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-sans text-sm text-muted">{t("sync.signedInAs", { email: user.email ?? "" })}</span>
            <button onClick={handleSignOut} className="font-sans text-xs font-bold text-[#8c4741] hover:text-[#722d27]">{t("sync.signOut")}</button>
          </div>

          {!unlocked ? (
            <form onSubmit={handleUnlock} className="grid gap-2">
              <label htmlFor="sync-passphrase" className="block font-sans text-xs font-bold text-[#46555b]">{t("sync.passphrase")}</label>
              <div className="flex flex-wrap gap-2">
                <input id="sync-passphrase" type="password" required minLength={8} autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className={`${inputClass} flex-1`} />
                <button type="submit" className={primaryClass}>{t("sync.unlock")}</button>
              </div>
              <p className="m-0 font-sans text-xs leading-relaxed text-muted">{t("sync.passphraseHint")}</p>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleSyncNow} disabled={busy} className={primaryClass}>{t("sync.syncNow")}</button>
                <button onClick={() => { sync.lock(); setUnlocked(false); }} className={buttonClass}>{t("sync.lock")}</button>
                <span
                  className="font-sans text-xs font-bold text-muted"
                  role="status"
                  aria-live="polite"
                >
                  {t(statusLabel(status))}
                </span>
              </div>
              <span className="font-sans text-xs text-muted">
                {t("sync.lastSync")}: {lastSync ? new Date(lastSync).toLocaleString() : t("sync.never")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
