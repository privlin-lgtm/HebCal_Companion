import { $ } from "./dom.js";

export function createToast({ root = document, durationMs = 5200 } = {}) {
  let timer;
  return function showToast(message, isError = false) {
    const toast = $("#toast", root);
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("show"), durationMs);
  };
}
