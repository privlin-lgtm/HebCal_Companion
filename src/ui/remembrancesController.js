import { isoDate } from "../domain/dates.js";
import { sortByNextIso } from "../domain/remembrance.js";
import { $ } from "./dom.js";

export function createRemembrancesController({ remembranceService, showToast, root = document }) {
  function render() {
    const records = remembranceService.list();
    const list = $("#remembrance-list", root);
    const summary = $("#remembrance-summary", root);
    list.replaceChildren();
    summary.textContent = records.length
      ? `${records.length} saved remembrance${records.length === 1 ? "" : "s"} · calculated from the Hebrew date`
      : "No saved remembrances yet.";
    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "empty-remembrances";
      empty.textContent = "Add a yahrzeit or anniversary to see its upcoming secular date.";
      list.append(empty);
      return;
    }

    sortByNextIso(records).forEach((record) => {
      const card = document.createElement("article");
      card.className = "remembrance-card";
      const icon = document.createElement("div");
      icon.className = "remembrance-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = record.type === "Yahrzeit" ? "◒" : "✦";
      const detail = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = record.name;
      const subtitle = document.createElement("p");
      subtitle.className = "remembrance-details";
      subtitle.textContent = `${record.type} · ${record.hd} ${record.hm} ${record.hy}`;
      detail.append(title, subtitle);
      const next = document.createElement("div");
      next.className = "next-date";
      const label = document.createElement("span");
      label.textContent = "Next observance";
      const date = document.createElement("strong");
      date.textContent = record.nextFormatted || "Calculating…";
      next.append(label, date);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-button";
      remove.setAttribute("aria-label", `Delete ${record.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        try {
          remembranceService.remove(record.id);
          render();
          showToast("Remembrance removed.");
        } catch (error) {
          showToast(error.message, true);
        }
      });
      card.append(icon, detail, next, remove);
      list.append(card);
    });
  }

  async function refreshUpcoming(hebrewYear) {
    if (!remembranceService.list().length) return;
    try {
      await remembranceService.refreshUpcoming(hebrewYear);
      render();
    } catch (error) {
      showToast(`Saved remembrances are available, but upcoming dates could not refresh: ${error.message}`, true);
    }
  }

  function bindDialog() {
    const dialog = $("#remembrance-dialog", root);
    const form = $("#remembrance-form", root);
    $("#remembrance-date", root).value = isoDate();
    $("#open-remembrance-dialog", root).addEventListener("click", () => dialog.showModal());
    [$("#close-dialog", root), $("#cancel-dialog", root)].forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorElement = $("#dialog-error", root);
      errorElement.hidden = true;
      const date = $("#remembrance-date", root).value;
      const name = $("#remembrance-name", root).value.trim();
      if (!name || !date) return;
      const [gy, gm, gd] = date.split("-").map(Number);
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        await remembranceService.createFromGregorian({
          name,
          type: $("#remembrance-type", root).value,
          gy, gm, gd,
          afterSunset: $("#remembrance-after-sunset", root).checked,
          originalDate: date,
        });
        dialog.close();
        form.reset();
        $("#remembrance-date", root).value = isoDate();
        render();
        await refreshUpcoming();
        showToast("Remembrance saved to this browser.");
      } catch (error) {
        errorElement.textContent = error.message;
        errorElement.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = "Save remembrance";
      }
    });
  }

  function bindIO() {
    $("#export-remembrances", root).addEventListener("click", () => {
      const payload = remembranceService.exportBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "or-zarua-remembrances.json";
      link.click();
      URL.revokeObjectURL(url);
      showToast(payload.remembrances.length ? "Remembrances exported." : "Exported an empty remembrance list.");
    });

    $("#import-remembrances", root).addEventListener("click", () => $("#import-remembrances-file", root).click());
    $("#import-remembrances-file", root).addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const merged = remembranceService.importBackup(await file.text());
        render();
        await refreshUpcoming();
        const parts = [`Imported ${merged.added} remembrance${merged.added === 1 ? "" : "s"}.`];
        if (merged.skipped) parts.push(`${merged.skipped} already saved.`);
        showToast(parts.join(" "));
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  function bind() {
    bindDialog();
    bindIO();
    render();
  }

  return { bind, render, refreshUpcoming };
}
