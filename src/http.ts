const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const RETRY_STATUS = [429, 500, 502, 503, 504];
/** Backoff before retry number `attempt` (0-based): 400ms, 900ms, ... capped; Retry-After (seconds) wins when small. */
export const backoffMs = (attempt: number, retryAfter?: string | null): number => {
  const hinted = Number(retryAfter);
  if (Number.isFinite(hinted) && hinted > 0) return Math.min(3000, hinted * 1000);
  return Math.min(3000, 400 * (attempt + 1) ** 2 + attempt * 100);
};

type Result<T> = { ok: boolean; status: number; body: T };
/**
 * JSON fetch with timeout. Idempotent GET requests are retried (network errors, 429, 5xx) with backoff;
 * anything that can change state (POST/DELETE) is NEVER retried so an order cannot be sent twice.
 */
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15000, retries?: number): Promise<Result<T>> {
  const method = String(init.method || 'GET').toUpperCase();
  const maxRetries = retries ?? (method === 'GET' ? 2 : 0);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const raw = await response.text();
      let body: unknown = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
      if (attempt < maxRetries && RETRY_STATUS.includes(response.status)) {
        await sleep(backoffMs(attempt, response.headers?.get?.('retry-after')));
        continue;
      }
      return { ok: response.ok, status: response.status, body: body as T };
    } catch (error) {
      lastError = new Error(error instanceof Error && error.name === 'AbortError' ? 'Koneksi timeout. Periksa internet lalu coba lagi.' : 'Tidak dapat terhubung ke server. Periksa koneksi internet.');
      if (attempt < maxRetries) { await sleep(backoffMs(attempt)); continue; }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Tidak dapat terhubung ke server.');
}
