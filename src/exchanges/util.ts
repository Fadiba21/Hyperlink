import HmacSHA256 from 'crypto-js/hmac-sha256';
import Hex from 'crypto-js/enc-hex';
import Base64 from 'crypto-js/enc-base64';
import { fetchJson } from '../http';

export const hmacHex = (payload: string, secret: string) => HmacSHA256(payload, secret).toString(Hex);
export const hmacBase64 = (payload: string, secret: string) => Base64.stringify(HmacSHA256(payload, secret));

export type Params = Record<string, string | number | boolean | undefined>;
export function clean(params: Params): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  Object.keys(params).forEach((k) => { const v = params[k]; if (v !== undefined && v !== '') out[k] = v; });
  return out;
}
export function toQuery(params: Params): string {
  const c = clean(params);
  return Object.keys(c).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(c[k]))}`).join('&');
}

const offsets: Record<string, { value: number; at: number }> = {};
/** Device-vs-server clock offset, cached 10 minutes; falls back to 0. */
export async function clockOffset(key: string, load: () => Promise<number>): Promise<number> {
  const c = offsets[key];
  if (c && Date.now() - c.at < 600000) return c.value;
  try {
    const before = Date.now();
    const server = await load();
    const after = Date.now();
    if (Number.isFinite(server) && server > 0) { const value = server - Math.round((before + after) / 2); offsets[key] = { value, at: Date.now() }; return value; }
  } catch { /* use device clock */ }
  return 0;
}

export const timeHint = 'Jam HP mungkin tidak akurat: aktifkan "Waktu otomatis" di pengaturan Android.';
export { fetchJson };
