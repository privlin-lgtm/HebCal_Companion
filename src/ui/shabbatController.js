import { parseDirectLocation } from "../domain/location.js";
import { $, $$ } from "./dom.js";

export function createShabbatController({ shabbatService, showToast, root = document }) {
  let requestController;

  function setActiveChip(geonameid) {
    $$(".city-chip", root).forEach((chip) => {
      chip.classList.toggle("active", Boolean(geonameid) && chip.dataset.geonameid === String(geonameid));
    });
  }

  function paint(view) {
    $("#location-title", root).textContent = view.place;
    $("#shabbat-date", root).textContent = view.endsLabel;
    $("#parashat", root).textContent = view.parashat;
    $("#candle-time", root).textContent = view.candleTime;
    $("#havdalah-time", root).textContent = view.havdalahTime;
    $("#shabbat-note", root).textContent = view.note;
    $("#shabbat-content", root).hidden = false;
  }

  function paintError(error) {
    $("#shabbat-date", root).textContent = "";
    $("#parashat", root).textContent = "Unable to load Shabbat times";
    $("#candle-time", root).textContent = "—";
    $("#havdalah-time", root).textContent = "—";
    $("#shabbat-note", root).textContent = error.message;
    $("#shabbat-content", root).hidden = false;
  }

  async function runLoad(task) {
    requestController?.abort();
    requestController = new AbortController();
    const { signal } = requestController;
    $("#shabbat-loading", root).hidden = false;
    $("#shabbat-content", root).hidden = true;
    try {
      const view = await task(signal);
      if (signal.aborted) return;
      paint(view);
    } catch (error) {
      if (error.name === "AbortError") return;
      paintError(error);
      showToast(error.message, true);
    } finally {
      if (!signal.aborted) $("#shabbat-loading", root).hidden = true;
    }
  }

  function load(location, fallbackName) {
    return runLoad((signal) => shabbatService.load(location, fallbackName, { signal }));
  }

  function bind() {
    $$(".city-chip", root).forEach((button) => {
      button.addEventListener("click", () => {
        const location = { kind: "geonameid", id: button.dataset.geonameid };
        setActiveChip(location.id);
        load(location, button.dataset.city);
      });
    });

    $("#location-form", root).addEventListener("submit", async (event) => {
      event.preventDefault();
      const city = $("#custom-city", root).value.trim();
      const country = $("#custom-country", root).value.trim();
      const value = $("#custom-location", root).value.trim();
      try {
        if (city || country) {
          if (!city || !country) {
            showToast("Enter both a city and country to search.", true);
            return;
          }
          setActiveChip(null);
          await runLoad((signal) => shabbatService.searchAndLoad(city, country, { signal }));
          return;
        }
        if (!value) {
          showToast("Enter a city and country, a five-digit US ZIP, or a Hebcal city code.", true);
          return;
        }
        const location = parseDirectLocation(value);
        setActiveChip(null);
        await load(location, value);
      } catch (error) {
        if (error.name !== "AbortError") showToast(error.message, true);
      }
    });

    const saved = shabbatService.initialSelection();
    setActiveChip(saved.location.kind === "geonameid" ? saved.location.id : null);
    load(saved.location, saved.name);
  }

  return { bind };
}
