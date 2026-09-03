import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { isoDate } from "../../domain/dates";
import { sortByNextIso, REMEMBRANCE_TYPES, type Remembrance, type RemembranceType } from "../../domain/remembrance";
import { useToast } from "../../hooks/useToast";

export function Remembrances() {
  const { t } = useTranslation();
  const { remembranceService } = useApp();
  const { showToast } = useToast();
  const [records, setRecords] = useState<Remembrance[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<RemembranceType>("Yahrzeit");
  const [date, setDate] = useState(isoDate());
  const [afterSunset, setAfterSunset] = useState(false);

  function refresh() {
    setRecords([...remembranceService.list()]);
  }

  useEffect(() => {
    refresh();
    // Refresh upcoming dates on mount
    remembranceService.refreshUpcoming().then(refresh).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date) return;
    setDialogError(null);
    setSaving(true);
    const [gy, gm, gd] = date.split("-").map(Number);
    try {
      await remembranceService.createFromGregorian({ name: name.trim(), type, gy, gm, gd, afterSunset, originalDate: date });
      setDialogOpen(false);
      setName("");
      setAfterSunset(false);
      setDate(isoDate());
      refresh();
      await remembranceService.refreshUpcoming();
      refresh();
      showToast(t("remembrances.saved"));
    } catch (err) {
      setDialogError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string, remembranceName: string) {
    try {
      remembranceService.remove(id);
      refresh();
      showToast(t("remembrances.removed"));
    } catch (err) {
      showToast((err as Error).message, true);
    }
  }

  function handleExport() {
    const payload = remembranceService.exportBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "or-zarua-remembrances.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast(payload.remembrances.length ? t("remembrances.exported") : t("remembrances.exportedEmpty"));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const merged = remembranceService.importBackup(await file.text());
      refresh();
      await remembranceService.refreshUpcoming();
      refresh();
      showToast(`${t("remembrances.imported", { count: merged.added })} ${merged.skipped ? t("remembrances.skipped", { count: merged.skipped }) : ""}`.trim());
    } catch (err) {
      showToast((err as Error).message, true);
    }
  }

  const sorted = sortByNextIso(records);

  return (
    <section id="remembrances" className="mx-auto max-w-6xl py-24" aria-labelledby="remembrances-title">
      <div className="flex items-end justify-between gap-8 pb-8">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-orange">{t("remembrances.eyebrow")}</p>
          <h2 id="remembrances-title" className="mt-1 text-3xl font-medium leading-none tracking-tight md:text-4xl lg:text-5xl">{t("remembrances.title")}</h2>
        </div>
        <p className="max-w-[330px] text-sm leading-relaxed text-muted">{t("remembrances.subtitle")}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <p className="m-0 text-sm text-muted">
          {records.length ? t("remembrances.count", { count: records.length }) : t("remembrances.empty")}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={handleExport} className="rounded-lg border border-[#bfc5c0] bg-white px-4 py-2 font-sans text-sm font-bold text-ink hover:bg-warm dark:border-line-dark dark:bg-warm-dark dark:text-ink-dark">{t("remembrances.export")}</button>
          <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-[#bfc5c0] bg-white px-4 py-2 font-sans text-sm font-bold text-ink hover:bg-warm dark:border-line-dark dark:bg-warm-dark dark:text-ink-dark">{t("remembrances.import")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          <button ref={openBtnRef} onClick={() => setDialogOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 font-sans text-sm font-bold text-white hover:bg-orange-dark">{t("remembrances.add")} +</button>
        </div>
      </div>

      <div className="grid gap-3" aria-live="polite">
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#c9c7bd] p-8 text-center text-muted dark:border-line-dark">{t("remembrances.emptyDetail")}</div>
        ) : (
          sorted.map((record) => (
            <article key={record.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-4 rounded-xl border border-line bg-white p-5 dark:border-line-dark dark:bg-warm-dark">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#faecda] text-xl text-orange-dark dark:bg-orange/20" aria-hidden="true">
                {record.type === "Yahrzeit" ? "◒" : "✦"}
              </div>
              <div>
                <h3 className="m-0 mb-1 text-lg font-normal">{record.name}</h3>
                <p className="m-0 font-sans text-xs text-muted">{record.type} · {record.hd} {record.hm} {record.hy}</p>
              </div>
              <div className="text-end">
                <span className="block font-sans text-xs text-muted">{t("remembrances.next")}</span>
                <strong className="block text-sm text-orange-dark">{record.nextFormatted || t("remembrances.calculating")}</strong>
              </div>
              <button
                onClick={() => handleDelete(record.id, record.name)}
                className="ml-2 rounded p-1.5 text-lg text-[#8c4741] hover:bg-[#f7e7e3]"
                aria-label={t("remembrances.deleteLabel", { name: record.name })}
              >×</button>
            </article>
          ))
        )}
      </div>

      {/* Dialog */}
      {dialogOpen && (
        <dialog open className="fixed inset-0 z-50 flex w-full max-w-[520px] items-center justify-center p-0" aria-labelledby="dialog-title">
          <div className="w-full rounded-2xl bg-white p-8 shadow-2xl dark:bg-warm-dark">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-orange">{t("dialog.eyebrow")}</p>
                <h2 id="dialog-title" className="mt-1 text-2xl font-normal tracking-tight">{t("dialog.title")}</h2>
              </div>
              <button onClick={() => { setDialogOpen(false); openBtnRef.current?.focus(); }} className="grid h-8 w-8 place-items-center rounded-full bg-warm text-xl text-muted hover:bg-warm/80 dark:bg-warm-dark" aria-label={t("dialog.close")}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <label htmlFor="r-name" className="mb-2 mt-4 block font-sans text-xs font-bold text-[#46555b]">{t("dialog.name")}</label>
              <input id="r-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("dialog.namePlaceholder")} autoFocus className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark" />
              <label htmlFor="r-type" className="mb-2 mt-4 block font-sans text-xs font-bold text-[#46555b]">{t("dialog.kind")}</label>
              <select id="r-type" value={type} onChange={(e) => setType(e.target.value as RemembranceType)} className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark">
                {REMEMBRANCE_TYPES.map((rt) => <option key={rt} value={rt}>{t(`dialog.kind${rt.charAt(0).toUpperCase()}${rt.slice(1)}`)}</option>)}
              </select>
              <label htmlFor="r-date" className="mb-2 mt-4 block font-sans text-xs font-bold text-[#46555b]">{t("dialog.originalDate")}</label>
              <input id="r-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark" />
              <label className="mt-4 mb-6 flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={afterSunset} onChange={(e) => setAfterSunset(e.target.checked)} className="sr-only" />
                <span className={`relative flex h-5 w-9 rounded-full transition ${afterSunset ? "bg-orange" : "bg-[#c7c9c4]"}`}>
                  <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${afterSunset ? "translate-x-4" : "translate-x-0.5"}`} />
                </span>
                <span>
                  <strong className="block font-serif text-sm text-ink dark:text-ink-dark">{t("dialog.afterSunset")}</strong>
                  <small className="mt-0.5 block font-sans text-xs text-muted">{t("dialog.afterSunsetDesc")}</small>
                </span>
              </label>
              {dialogError && <p role="alert" className="mb-4 font-sans text-sm text-[#9e3029]">{dialogError}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => { setDialogOpen(false); openBtnRef.current?.focus(); }} className="rounded-lg border border-[#bfc5c0] bg-white px-4 py-2 font-sans text-sm font-bold text-ink hover:bg-warm dark:border-line-dark dark:bg-warm-dark dark:text-ink-dark">{t("dialog.cancel")}</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-orange px-4 py-2 font-sans text-sm font-bold text-white hover:bg-orange-dark disabled:opacity-50">{saving ? t("dialog.saving") : t("dialog.save")}</button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </section>
  );
}
