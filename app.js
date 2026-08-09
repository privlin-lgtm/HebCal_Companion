const API_ROOT = "https://www.hebcal.com";
const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
const STORAGE_KEY = "or-zarua-remembrances-v1";
const $ = (selector) => document.querySelector(selector);

let toastTimer;

function isoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatGregorian(year, month, day) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(year, month - 1, day));
}

function formatApiDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function timeFromTitle(title) {
  const match = title.match(/:\s*(.+)$/);
  return match ? match[1] : title;
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 5200);
}

async function hebcalJson(path, params) {
  const url = new URL(path, API_ROOT);
  Object.entries({ cfg: "json", ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Could not reach Hebcal. Check your connection and try again.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error("Hebcal is temporarily busy. Please wait a moment and try again.");
    throw new Error(`Hebcal could not complete this request (${response.status}).`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Hebcal returned an unexpected response. Please try again.");
  }
}

function setToday(data) {
  $("#today-hebrew").textContent = data.hebrew;
  $("#today-gregorian").textContent = formatGregorian(data.gy, data.gm, data.gd);
  $("#hebrew-year").value = data.hy;
}

async function loadToday() {
  const today = new Date();
  try {
    const data = await hebcalJson("/converter", {
      gy: today.getFullYear(),
      gm: today.getMonth() + 1,
      gd: today.getDate(),
      g2h: 1,
    });
    setToday(data);
  } catch (error) {
    $("#today-hebrew").textContent = "Hebrew date unavailable";
    $("#today-gregorian").textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(today);
    showToast(error.message, true);
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
    const data = await hebcalJson("/converter", {
      gy, gm, gd, g2h: 1,
      ...( $("#after-sunset").checked ? { gs: "on" } : {}),
    });
    showConversion(data);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function convertHebrew(event) {
  event.preventDefault();
  try {
    const data = await hebcalJson("/converter", {
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

function setupConverter() {
  $("#gregorian-date").value = isoDate();
  $("#gregorian-form").addEventListener("submit", convertGregorian);
  $("#hebrew-form").addEventListener("submit", convertHebrew);
  const tabs = [
    { button: $("#gregorian-tab"), panel: $("#gregorian-panel") },
    { button: $("#hebrew-tab"), panel: $("#hebrew-panel") },
  ];
  tabs.forEach((tab) => tab.button.addEventListener("click", () => {
    tabs.forEach((item) => {
      const active = item === tab;
      item.button.classList.toggle("active", active);
      item.button.setAttribute("aria-selected", active);
      item.panel.hidden = !active;
    });
  }));
}

function locationParams(value, kind) {
  if (kind === "geonameid") return { geonameid: value };
  if (kind === "coordinates") return value;
  if (/^\d{5}(?:-\d{4})?$/.test(value)) return { zip: value };
  return { city: value };
}

async function searchCityLocation(city, country) {
  const url = new URL(GEOCODING_API);
  url.search = new URLSearchParams({
    name: `${city}, ${country}`,
    count: "1",
    language: "en",
    format: "json",
  });
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Could not search for that city. Check your connection and try again.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error("City search is temporarily busy. Please wait a moment and try again.");
    throw new Error(`City search could not complete this request (${response.status}).`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("City search returned an unexpected response. Please try again.");
  }
  const result = data.results?.[0];
  if (!result?.timezone) {
    throw new Error(`No city matching “${city}, ${country}” was found. Check the spelling and try again.`);
  }
  return {
    name: [result.name, result.admin1, result.country].filter((part, index, values) => part && values.indexOf(part) === index).join(", "),
    params: {
      latitude: result.latitude,
      longitude: result.longitude,
      tzid: result.timezone,
    },
  };
}

async function loadShabbat(value = "281184", kind = "geonameid", fallbackName = "Jerusalem, Israel") {
  $("#shabbat-loading").hidden = false;
  $("#shabbat-content").hidden = true;
  try {
    const data = await hebcalJson("/shabbat", locationParams(value, kind));
    const candles = data.items.find((item) => item.category === "candles");
    const havdalah = data.items.find((item) => item.category === "havdalah");
    const parashat = data.items.find((item) => item.category === "parashat");
    if (!candles || !havdalah) throw new Error("Hebcal did not return complete Shabbat times for this location.");

    $("#location-title").textContent = data.location?.title || fallbackName;
    $("#shabbat-date").textContent = data.range?.end ? `Ends ${formatApiDate(data.range.end)}` : "";
    $("#parashat").textContent = parashat?.title || candles.memo || "Shabbat";
    $("#candle-time").textContent = timeFromTitle(candles.title);
    $("#havdalah-time").textContent = timeFromTitle(havdalah.title);
    $("#shabbat-note").textContent = `Times are calculated for ${data.location?.title || fallbackName}. Confirm local community practice when needed.`;
    $("#shabbat-content").hidden = false;
  } catch (error) {
    $("#shabbat-date").textContent = "";
    $("#parashat").textContent = "Unable to load Shabbat times";
    $("#candle-time").textContent = "—";
    $("#havdalah-time").textContent = "—";
    $("#shabbat-note").textContent = error.message;
    $("#shabbat-content").hidden = false;
    showToast(error.message, true);
  } finally {
    $("#shabbat-loading").hidden = true;
  }
}

function setupShabbat() {
  document.querySelectorAll(".city-chip").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".city-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    loadShabbat(button.dataset.geonameid, "geonameid", button.dataset.city);
  }));
  $("#location-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const city = $("#custom-city").value.trim();
    const country = $("#custom-country").value.trim();
    const value = $("#custom-location").value.trim();
    if (city || country) {
      if (!city || !country) {
        showToast("Enter both a city and country to search.", true);
        return;
      }
      searchCityLocation(city, country)
        .then((location) => {
          document.querySelectorAll(".city-chip").forEach((chip) => chip.classList.remove("active"));
          return loadShabbat(location.params, "coordinates", location.name);
        })
        .catch((error) => showToast(error.message, true));
      return;
    }
    if (!value) {
      showToast("Enter a city and country, a five-digit US ZIP, or a Hebcal city code.", true);
      return;
    }
    document.querySelectorAll(".city-chip").forEach((chip) => chip.classList.remove("active"));
    loadShabbat(value, "custom", value);
  });
  loadShabbat();
}

function readRemembrances() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function writeRemembrances(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
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
  records.sort((a, b) => (a.nextIso || "9999").localeCompare(b.nextIso || "9999")).forEach((record) => {
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
      writeRemembrances(readRemembrances().filter((item) => item.id !== record.id));
      renderRemembrances();
      showToast("Remembrance removed.");
    });
    card.append(icon, detail, next, remove);
    list.append(card);
  });
}

async function futureDate(record, currentHebrewYear) {
  for (let year = currentHebrewYear; year <= currentHebrewYear + 2; year += 1) {
    try {
      const data = await hebcalJson("/converter", { hy: year, hm: record.hm, hd: record.hd, h2g: 1 });
      const candidate = `${data.gy}-${String(data.gm).padStart(2, "0")}-${String(data.gd).padStart(2, "0")}`;
      if (candidate >= isoDate()) return { iso: candidate, formatted: formatGregorian(data.gy, data.gm, data.gd) };
    } catch {
      // A month such as Adar II can be absent in a non-leap year; try the next year.
    }
  }
  return null;
}

async function refreshUpcomingRemembrances() {
  const records = readRemembrances();
  if (!records.length) return;
  try {
    const today = new Date();
    const current = await hebcalJson("/converter", {
      gy: today.getFullYear(), gm: today.getMonth() + 1, gd: today.getDate(), g2h: 1,
    });
    for (const record of records) {
      const next = await futureDate(record, current.hy);
      if (next) Object.assign(record, { nextIso: next.iso, nextFormatted: next.formatted });
    }
    writeRemembrances(records);
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
      const converted = await hebcalJson("/converter", {
        gy, gm, gd, g2h: 1,
        ...( $("#remembrance-after-sunset").checked ? { gs: "on" } : {}),
      });
      const records = readRemembrances();
      records.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
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

function init() {
  setupConverter();
  setupShabbat();
  setupRemembranceDialog();
  renderRemembrances();
  loadToday().then(refreshUpcomingRemembrances);
}

init();
