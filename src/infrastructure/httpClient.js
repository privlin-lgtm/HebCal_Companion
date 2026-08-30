/**
 * Shared JSON HTTP client. Inject `fetchImpl` for tests / alternate runtimes.
 */
export function createHttpClient({ fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  return async function httpJson(url, { signal, label = "The service" } = {}) {
    let response;
    try {
      response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error(`Could not reach ${label}. Check your connection and try again.`);
    }
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(`${label} is temporarily busy. Please wait a moment and try again.`);
      }
      throw new Error(`${label} could not complete this request (${response.status}).`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`${label} returned an unexpected response. Please try again.`);
    }
  };
}
