import { convert, hebcalJson } from "./lib/http.js";
import { clockFromHebcalItem, formatApiDate, formatGregorian, isoDate } from "./lib/dates.js";
import {
  DEFAULT_LOCATION,
  DEFAULT_LOCATION_NAME,
  parseDirectLocation,
  searchCityLocation,
  toHebcalParams,
} from "./lib/location.js";
import { refreshUpcoming } from "./lib/remembrances.js";
import {
  mergeImported,
  mergeUpcomingDates,
  parseImport,
  readLastLocation,
  readRemembrances,
  serializeExport,
  writeLastLocation,
  writeRemembrances,
} from "./lib/storage.js";

const $ = (selector) => document.querySelector(selector);

let toastTimer;
let shabbatController;

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 5200);
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setToday(data) {
  $("#today-hebrew").textContent = data.hebrew;
  $("#today-gregorian").textContent = formatGregorian(data.gy, data.gm, data.gd);
  $("#hebrew-year").value = data.hy;
}

async function loadToday() {
  const today = new Date();
  try {
    const data = await convert({
      gy: today.getFullYear(),
      gm: today.getMonth() + 1,
      gd: today.getDate(),
      g2h: 1,
    });
    setToday(data);
    return data;
  } catch (error) {
    $("#today-hebrew").textContent = "Hebrew date unavailable";
    $("#today-gregorian").textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(today);
    showToast(error.message, true);
    return null;
  }
}

function showConversion(data) {
  $("#conversion-empty").hidden = true;
  $("#conversion-content").hidden = false;
  $("#result-primary").textContent = formatGregorian(data.gy, data.gm, data.gd);
  $("#result-hebrew").textContent = `${data.hebrew} · ${data.hy} ${data.hm} ${data.hd}`;
  const observances = $("#result-observances");
  observances.replaceChildren();
  (data.events || []).forEach((event) => {
    const tag = document.createElement("span");
    tag.textContent = event;
    observances.append(tag);
  });
}

async function convertGregorian(event) {
  event.preventDefault();
  const selected = $("#gregorian-date").value;
  if (!selected) return;
  const [gy, gm, gd] = selected.split("-").map(Number);
  try {
    const data = await convert({
      gy, gm, gd, g2h: 1,
      ...($("#after-sunset").checked ? { gs: "on" } : {}),
    });
    showConversion(data);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function convertHebrew(event) {
  event.preventDefault();
  try {
    const data = await convert({
      hy: $("#hebrew-year").value,
      hm: $("#hebrew-month").value,
      hd: $("#hebrew-day").value,
      h2g: 1,
    });
    showConversion(data);
  } catch (error) {
    showToast(error.message, true);
  }
}

function activateTab(tabs, selected) {
  tabs.forEach((item) => {
    const active = item === selected;
    item.button.classList.toggle("active", active);
    item.button.setAttribute("aria-selected", active);
    item.button.tabIndex = active ? 0 : -1;
    item.panel.hidden = !active;
  });
}

function setupConverter() {
  $("#gregorian-date").value = isoDate();
  $("#gregorian-form").addEventListener("submit", convertGregorian);
  $("#hebrew-form").addEventListener("submit", convertHebrew);
  const tabs = [
    { button: $("#gregorian-tab"), panel: $("#gregorian-panel") },
    { button: $("#hebrew-tab"), panel: $("#hebrew-panel") },
  ];
  tabs.forEach((tab, index) => {
    tab.button.tabIndex = index === 0 ? 0 : -1;
    tab.button.addEventListener("click", () => activateTab(tabs, tab));
    tab.button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + offset + tabs.length) % tabs.length];
      activateTab(tabs, next);
      next.button.focus();
    });
  });
}

function setActiveChip(geonameid) {
  document.querySelectorAll(".city-chip").forEach((chip) => {
    chip.classList.toggle("active", Boolean(geonameid) && chip.dataset.geonameid === String(geonameid));
  });
}

function paintShabbat(data, fallbackName) {
  const candles = data.items.find((item) => item.category === "candles");
  const havdalah = data.items.find((item) => item.category === "havdalah");
  const parashat = data.items.find((item) => item.category === "parashat");
  if (!candles || !havdalah) throw new Error("Hebcal did not return complete Shabbat times for this location.");

  const place = data.location?.title || fallbackName;
  const timeZone = data.location?.tzid;
  $("#location-title").textContent = place;
  $("#shabbat-date").textContent = data.range?.end ? `Ends ${formatApiDate(data.range.end)}` : "";
  $("#parashat").textContent = parashat?.title || candles.memo || "Shabbat";
  $("#candle-time").textContent = clockFromHebcalItem(candles, timeZone);
  $("#havdalah-time").textContent = clockFromHebcalItem(havdalah, timeZone);
  $("#shabbat-note").textContent = `Times are calculated for ${place}. Confirm local community practice when needed.`;
  $("#shabbat-content").hidden = false;
}

function paintShabbatError(error) {
  $("#shabbat-date").textContent = "";
  $("#parashat").textContent = "Unable to load Shabbat times";
  $("#candle-time").textContent = "—";
  $("#havdalah-time").textContent = "—";
  $("#shabbat-note").textContent = error.message;
  $("#shabbat-content").hidden = false;
}

async function loadShabbat(location, fallbackName = DEFAULT_LOCATION_NAME) {
  shabbatController?.abort();
  shabbatController = new AbortController();
  const { signal } = shabbatController;

  $("#shabbat-loading").hidden = false;
  $("#shabbat-content").hidden = true;
  try {
    const data = await hebcalJson("/shabbat", toHebcalParams(location), { signal });
    if (signal.aborted) return;
    paintShabbat(data, fallbackName);
    writeLastLocation(location, data.location?.title || fallbackName);
  } catch (error) {
    if (error.name === "AbortError") return;
    paintShabbatError(error);
    showToast(error.message, true);
  } finally {
    if (!signal.aborted) $("#shabbat-loading").hidden = true;
  }
}

function setupShabbat() {
  document.querySelectorAll(".city-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const location = { kind: "geonameid", id: button.dataset.geonameid };
      setActiveChip(location.id);
      loadShabbat(location, button.dataset.city);
    });
  });

  $("#location-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const city = $("#custom-city").value.trim();
    const country = $("#custom-country").value.trim();
    const value = $("#custom-location").value.trim();
    try {
      if (city || country) {
        if (!city || !country) {
          showToast("Enter both a city and country to search.", true);
          return;
        }
        const found = await searchCityLocation(city, country);
        setActiveChip(null);
        await loadShabbat(found.location, found.name);
        return;
      }
      if (!value) {
        showToast("Enter a city and country, a five-digit US ZIP, or a Hebcal city code.", true);
        return;
      }
      const location = parseDirectLocation(value);
      setActiveChip(null);
      await loadShabbat(location, value);
    } catch (error) {
      if (error.name !== "AbortError") showToast(error.message, true);
    }
  });

  const saved = readLastLocation();
  if (saved) {
    setActiveChip(saved.location.kind === "geonameid" ? saved.location.id : null);
    loadShabbat(saved.location, saved.name);
    return;
  }
  loadShabbat(DEFAULT_LOCATION, DEFAULT_LOCATION_NAME);
}

function renderRemembrances() {
  const records = readRemembrances();
  const list = $("#remembrance-list");
  const summary = $("#remembrance-summary");
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
  [...records]
    .sort((a, b) => (a.nextIso || "9999").localeCompare(b.nextIso || "9999"))
    .forEach((record) => {
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
          writeRemembrances(readRemembrances().filter((item) => item.id !== record.id));
          renderRemembrances();
          showToast("Remembrance removed.");
        } catch (error) {
          showToast(error.message, true);
        }
      });
      card.append(icon, detail, next, remove);
      list.append(card);
    });
}

async function refreshUpcomingRemembrances(hebrewYear) {
  const records = readRemembrances();
  if (!records.length) return;
  try {
    let year = hebrewYear;
    if (!year) {
      const today = new Date();
      const current = await convert({
        gy: today.getFullYear(), gm: today.getMonth() + 1, gd: today.getDate(), g2h: 1,
      });
      year = current.hy;
    }
    const updates = await refreshUpcoming(records, year, convert);
    if (updates.size) mergeUpcomingDates(updates);
    renderRemembrances();
  } catch (error) {
    showToast(`Saved remembrances are available, but upcoming dates could not refresh: ${error.message}`, true);
  }
}

function setupRemembranceDialog() {
  const dialog = $("#remembrance-dialog");
  const form = $("#remembrance-form");
  $("#remembrance-date").value = isoDate();
  $("#open-remembrance-dialog").addEventListener("click", () => dialog.showModal());
  [$("#close-dialog"), $("#cancel-dialog")].forEach((button) => button.addEventListener("click", () => dialog.close()));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = $("#dialog-error");
    errorElement.hidden = true;
    const date = $("#remembrance-date").value;
    const name = $("#remembrance-name").value.trim();
    if (!name || !date) return;
    const [gy, gm, gd] = date.split("-").map(Number);
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      const converted = await convert({
        gy, gm, gd, g2h: 1,
        ...($("#remembrance-after-sunset").checked ? { gs: "on" } : {}),
      });
      const records = readRemembrances();
      records.push({
        id: newId(),
        name,
        type: $("#remembrance-type").value,
        hy: converted.hy,
        hm: converted.hm,
        hd: converted.hd,
        originalDate: date,
      });
      writeRemembrances(records);
      dialog.close();
      form.reset();
      $("#remembrance-date").value = isoDate();
      renderRemembrances();
      await refreshUpcomingRemembrances();
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

function setupRemembranceIO() {
  $("#export-remembrances").addEventListener("click", () => {
    const payload = serializeExport(readRemembrances());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "or-zarua-remembrances.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast(payload.remembrances.length ? "Remembrances exported." : "Exported an empty remembrance list.");
  });

  $("#import-remembrances").addEventListener("click", () => $("#import-remembrances-file").click());
  $("#import-remembrances-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const incoming = parseImport(await file.text());
      const merged = mergeImported(readRemembrances(), incoming);
      writeRemembrances(merged.records);
      renderRemembrances();
      await refreshUpcomingRemembrances();
      const parts = [`Imported ${merged.added} remembrance${merged.added === 1 ? "" : "s"}.`];
      if (merged.skipped) parts.push(`${merged.skipped} already saved.`);
      showToast(parts.join(" "));
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function init() {
  setupConverter();
  setupShabbat();
  setupRemembranceDialog();
  setupRemembranceIO();
  renderRemembrances();
  loadToday().then((data) => refreshUpcomingRemembrances(data?.hy));
}

init();
