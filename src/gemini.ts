import { fetchJson } from './http';
import { normalizeSymbol, parseTelegramCall, riskReward, validateSignal, type Signal } from './signal';
import { boundAdvice, localAdvice, type AdviceContext, type MarginAdvice } from './advice';

export type { Signal };
export type GeminiModel = { name: string; displayName: string; description?: string; supportedGenerationMethods?: string[] };

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_DEFAULT_MODELS: GeminiModel[] = [
  { name: 'gemini-flash-latest', displayName: 'Flash · otomatis terbaru (disarankan)' },
  { name: 'gemini-flash-lite-latest', displayName: 'Flash-Lite · otomatis terbaru' },
  { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
  { name: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite' },
  { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
  { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash · Legacy' },
];

const modelId = (model: string) => (model.trim() || 'gemini-flash-latest').replace(/^models\//, '');
type ErrBody = { error?: { message?: string } };
const headers = (apiKey: string) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() });

function explain(status: number, body: ErrBody, model: string): Error {
  const msg = body.error?.message || `Gemini HTTP ${status}`;
  if (status === 400 && /API key/i.test(msg)) return new Error('Gemini API Key tidak valid.');
  if (status === 403) return new Error('Gemini menolak akses (403). Periksa API key / wilayah.');
  if (status === 404) return new Error(`Model Gemini "${model}" tidak ditemukan. Tekan "Test & muat model" lalu pilih model yang tersedia.`);
  if (status === 429) return new Error('Kuota Gemini habis / terlalu banyak request. Coba lagi sebentar.');
  return new Error(msg);
}

export async function listGeminiModels(apiKey: string): Promise<GeminiModel[]> {
  if (!apiKey.trim()) throw new Error('Gemini API Key belum diisi.');
  const res = await fetchJson<{ models?: GeminiModel[] } & ErrBody>(`${BASE_URL}/models?pageSize=200`, { headers: headers(apiKey) });
  if (!res.ok) throw explain(res.status, res.body, '');
  const models = (res.body.models || []).filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /flash/i.test(m.name)).map((m) => ({ ...m, name: modelId(m.name) }));
  const sorted = models.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  return sorted.length ? [GEMINI_DEFAULT_MODELS[0], ...sorted] : GEMINI_DEFAULT_MODELS;
}

export async function testGeminiConnection(apiKey: string, model = 'gemini-flash-latest'): Promise<void> {
  if (!apiKey.trim()) throw new Error('Gemini API Key belum diisi.');
  const res = await fetchJson<{ name?: string } & ErrBody>(`${BASE_URL}/models/${encodeURIComponent(modelId(model))}`, { headers: headers(apiKey) });
  if (!res.ok) throw explain(res.status, res.body, model);
  if (!res.body.name) throw new Error('Model Gemini tidak ditemukan atau API key tidak punya akses.');
}

const SYSTEM = [
  'You extract crypto USDT-perpetual futures trade calls from Telegram messages. Read common formats: LONG/SHORT, BUY/SELL, entry ranges, market entry, SL/stop loss, TP/targets, leverage, emojis.',
  'Return JSON only. Never invent or guess missing values: if entry, stop loss, take profit or direction is not explicitly stated, set is_signal=false and confidence=0.',
  'For an entry range, return entryLow and entryHigh as the numeric bounds and entry as the midpoint. For a single entry, set entryLow=entryHigh=entry. Return every explicitly stated take-profit price in takeProfits, ordered from nearest to farthest in trade direction; takeProfit must equal the first item.',
  'If entry is "market"/"now" and a current price is not given, set is_signal=false. symbol is base coin plus USDT, uppercase (e.g. BTCUSDT). leverage is an integer (use 5 if none is given). confidence is 0..1.',
].join(' ');

function extractJson(text: string): string {
  const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Gemini mengembalikan format signal yang tidak valid.');
  return clean.slice(start, end + 1);
}

export async function analyzeSignal(apiKey: string, message: string, model = 'gemini-flash-latest', minConfidence = 0.8): Promise<Signal> {
  if (!message.trim()) throw new Error('Tempel pesan call Telegram terlebih dahulu.');
  const direct = parseTelegramCall(message);
  if (direct) {
    const problem = validateSignal(direct);
    if (problem) throw new Error(`Signal ditolak: ${problem}`);
    if (direct.confidence < minConfidence) throw new Error(`Signal ditolak: confidence di bawah ${Math.round(minConfidence * 100)}%.`);
    return direct;
  }
  if (!apiKey.trim()) throw new Error('Gemini API Key belum diisi.');
  const res = await fetchJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; promptFeedback?: { blockReason?: string } } & ErrBody>(`${BASE_URL}/models/${encodeURIComponent(modelId(model))}:generateContent`, {
    method: 'POST', headers: headers(apiKey),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: message.slice(0, 4000) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { is_signal: { type: 'BOOLEAN' }, symbol: { type: 'STRING' }, direction: { type: 'STRING', enum: ['LONG', 'SHORT'] }, entry: { type: 'NUMBER' }, entryLow: { type: 'NUMBER' }, entryHigh: { type: 'NUMBER' }, stopLoss: { type: 'NUMBER' }, takeProfit: { type: 'NUMBER' }, takeProfits: { type: 'ARRAY', items: { type: 'NUMBER' } }, leverage: { type: 'INTEGER' }, confidence: { type: 'NUMBER' }, rationale: { type: 'STRING' } }, required: ['is_signal', 'symbol', 'direction', 'entry', 'entryLow', 'entryHigh', 'stopLoss', 'takeProfit', 'takeProfits', 'leverage', 'confidence', 'rationale'] } },
    }),
  }, 30000);
  if (!res.ok) throw explain(res.status, res.body, model);
  if (res.body.promptFeedback?.blockReason) throw new Error(`Gemini memblokir pesan (${res.body.promptFeedback.blockReason}).`);
  const text = res.body.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini tidak mengembalikan signal.');
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(extractJson(text)); } catch (e) { throw e instanceof Error && /format/.test(e.message) ? e : new Error('Respons Gemini bukan JSON valid.'); }
  if (raw.is_signal === false) throw new Error('Pesan ini bukan signal trading yang lengkap.');
  let confidence = Number(raw.confidence);
  if (confidence > 1) confidence /= 100;
  const entry = Number(raw.entry);
  const targets = Array.isArray(raw.takeProfits) ? raw.takeProfits.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const takeProfit = targets[0] || Number(raw.takeProfit);
  const signal: Signal = {
    symbol: normalizeSymbol(String(raw.symbol || '')), direction: String(raw.direction).toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
    entry, entryLow: Number(raw.entryLow) > 0 ? Number(raw.entryLow) : entry, entryHigh: Number(raw.entryHigh) > 0 ? Number(raw.entryHigh) : entry,
    stopLoss: Number(raw.stopLoss), takeProfit, takeProfits: targets.length ? targets : [takeProfit], leverage: Math.round(Number(raw.leverage)) || 5, confidence, rationale: String(raw.rationale || ''),
  };
  if (!Number.isFinite(confidence) || confidence < minConfidence) throw new Error(`Signal ditolak: confidence ${Math.round((confidence || 0) * 100)}% di bawah ${Math.round(minConfidence * 100)}%.`);
  const problem = validateSignal(signal);
  if (problem) throw new Error(`Signal ditolak: ${problem}`);
  return signal;
}

const ADVISOR = [
  'You are a cautious crypto futures risk advisor. Given one trade call and a computed baseline, choose what percentage (1-100) of the free balance to use as margin.',
  'Stay within roughly 0.5x-1.5x of the baseline; lower it for low R:R, high leverage, a very tight or very wide stop, or volatile/illiquid coins; never raise risk just because confidence is high.',
  'Pick margin_mode Isolated for leverage above 20 or risky calls, otherwise follow the user preference. Write reason in Indonesian, max 200 characters, concrete (mention SL distance, R:R, leverage).',
].join(' ');

/** Local baseline + Gemini opinion. Falls back to the local advice if Gemini fails; the result is always bounded by the baseline. */
export async function adviseMargin(apiKey: string, signal: Signal, ctx: AdviceContext, model = 'gemini-flash-latest'): Promise<MarginAdvice> {
  const base = localAdvice(signal, ctx);
  if (!apiKey.trim()) return base;
  try {
    const slDist = (Math.abs(signal.entry - signal.stopLoss) / signal.entry) * 100;
    const prompt = JSON.stringify({ symbol: signal.symbol, direction: signal.direction, entry: signal.entry, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit, leverage: signal.leverage, confidence: signal.confidence, slDistancePct: Number(slDist.toFixed(2)), riskReward: Number(riskReward(signal).toFixed(2)), userMarginMode: ctx.marginMode, maxLossPerTradePctOfEquity: ctx.riskPerTradePct, baselineMarginPct: base.pct, baselineMode: base.mode, baselineNote: base.reason });
    const res = await fetchJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } & ErrBody>(`${BASE_URL}/models/${encodeURIComponent(modelId(model))}:generateContent`, {
      method: 'POST', headers: headers(apiKey),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: ADVISOR }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { margin_pct: { type: 'INTEGER' }, margin_mode: { type: 'STRING', enum: ['Cross', 'Isolated'] }, risk_level: { type: 'STRING', enum: ['rendah', 'sedang', 'tinggi'] }, reason: { type: 'STRING' } }, required: ['margin_pct', 'margin_mode', 'risk_level', 'reason'] } } }),
    }, 25000);
    if (!res.ok) return base;
    const text = res.body.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const raw = JSON.parse(extractJson(text)) as Record<string, unknown>;
    const pct = Number(raw.margin_pct);
    if (!Number.isFinite(pct)) return base;
    return boundAdvice({ pct, mode: raw.margin_mode === 'Cross' ? 'Cross' : 'Isolated', risk: raw.risk_level as MarginAdvice['risk'], reason: String(raw.reason || '') }, base, signal);
  } catch { return base; }
}
