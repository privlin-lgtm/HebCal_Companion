import { isoDate } from "../domain/dates.js";

/** Clock port implementation. */
export function createClock({ now = () => new Date() } = {}) {
  return {
    now,
    todayIso: () => isoDate(now()),
  };
}
