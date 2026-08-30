import { formatGregorian, isoDate } from "../domain/dates";
import { $ } from "./dom.js";

function activateTab(tabs, selected) {
  tabs.forEach((item) => {
    const active = item === selected;
    item.button.classList.toggle("active", active);
    item.button.setAttribute("aria-selected", active);
    item.button.tabIndex = active ? 0 : -1;
    item.panel.hidden = !active;
  });
}

export function createConverterController({ convertService, showToast, root = document }) {
  function setToday(data) {
    $("#today-hebrew", root).textContent = data.hebrew;
    $("#today-gregorian", root).textContent = formatGregorian(data.gy, data.gm, data.gd);
    $("#hebrew-year", root).value = data.hy;
  }

  function showConversion(data) {
    $("#conversion-empty", root).hidden = true;
    $("#conversion-content", root).hidden = false;
    $("#result-primary", root).textContent = formatGregorian(data.gy, data.gm, data.gd);
    $("#result-hebrew", root).textContent = `${data.hebrew} · ${data.hy} ${data.hm} ${data.hd}`;
    const observances = $("#result-observances", root);
    observances.replaceChildren();
    (data.events || []).forEach((event) => {
      const tag = document.createElement("span");
      tag.textContent = event;
      observances.append(tag);
    });
  }

  async function loadToday() {
    const today = new Date();
    try {
      const data = await convertService.todayHebrew(today);
      setToday(data);
      return data;
    } catch (error) {
      $("#today-hebrew", root).textContent = "Hebrew date unavailable";
      $("#today-gregorian", root).textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(today);
      showToast(error.message, true);
      return null;
    }
  }

  function bind() {
    $("#gregorian-date", root).value = isoDate();
    $("#gregorian-form", root).addEventListener("submit", async (event) => {
      event.preventDefault();
      const selected = $("#gregorian-date", root).value;
      if (!selected) return;
      const [gy, gm, gd] = selected.split("-").map(Number);
      try {
        showConversion(await convertService.gregorianToHebrew({
          gy, gm, gd,
          afterSunset: $("#after-sunset", root).checked,
        }));
      } catch (error) {
        showToast(error.message, true);
      }
    });

    $("#hebrew-form", root).addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        showConversion(await convertService.hebrewToGregorian({
          hy: $("#hebrew-year", root).value,
          hm: $("#hebrew-month", root).value,
          hd: $("#hebrew-day", root).value,
        }));
      } catch (error) {
        showToast(error.message, true);
      }
    });

    const tabs = [
      { button: $("#gregorian-tab", root), panel: $("#gregorian-panel", root) },
      { button: $("#hebrew-tab", root), panel: $("#hebrew-panel", root) },
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

  return { bind, loadToday };
}
