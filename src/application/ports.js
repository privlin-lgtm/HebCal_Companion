/**
 * Application ports (dependency contracts).
 *
 * Implementations live in infrastructure; use cases depend only on these shapes.
 *
 * @typedef {object} CalendarPort
 * @property {(params: object, options?: {signal?: AbortSignal}) => Promise<object>} convert
 * @property {(location: object, options?: {signal?: AbortSignal}) => Promise<object>} getShabbat
 *
 * @typedef {object} GeocoderPort
 * @property {(city: string, country: string, options?: {signal?: AbortSignal}) => Promise<{name: string, location: object}>} searchCity
 *
 * @typedef {object} RemembranceRepository
 * @property {() => object[]} list
 * @property {(records: object[]) => object[]} saveAll
 * @property {(updatesById: Map<string, object>) => object[]} mergeUpcoming
 *
 * @typedef {object} LocationStore
 * @property {() => ({name: string, location: object}|null)} read
 * @property {(location: object, name: string) => void} write
 *
 * @typedef {object} IdGenerator
 * @property {() => string} next
 *
 * @typedef {object} Clock
 * @property {() => Date} now
 * @property {() => string} todayIso
 */

export {};
