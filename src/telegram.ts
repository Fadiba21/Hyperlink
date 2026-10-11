import TdLib from 'react-native-tdlib';
import { NativeEventEmitter, NativeModules } from 'react-native';
import type { Credentials } from './security';

const nativeModule = NativeModules.TdLibModule;
const emitter = new NativeEventEmitter((nativeModule || { addListener: () => undefined, removeListeners: () => undefined }) as never);
let subscription: { remove: () => void } | null = null;
let started = false;
let startPending: Promise<string> | null = null;

export type TelegramChat = { id: number; title: string; kind: 'Channel' | 'Grup' | 'Chat'; username?: string };
export type TelegramMessage = { chatId: number; messageId: number; text: string; date?: number; outgoing: boolean };
export type AuthStep = 'idle' | 'starting' | 'phone' | 'code' | 'password' | 'ready' | 'closed' | 'unsupported';

export function mapAuthState(value: string): AuthStep {
  let name = value;
  try { const parsed = JSON.parse(value); name = parsed?.['@type'] || parsed?.authorization_state?.['@type'] || value; } catch { /* plain string */ }
  const s = String(name).toLowerCase();
  if (s.includes('waitphone')) return 'phone';
  if (s.includes('waitcode')) return 'code';
  if (s.includes('waitpassword')) return 'password';
  if (s.includes('ready')) return 'ready';
  if (s.includes('closing') || s.includes('closed') || s.includes('loggingout')) return 'closed';
  if (s.includes('waitregistration') || s.includes('waitotherdevice') || s.includes('waitemail')) return 'unsupported';
  return 'starting';
}

function textOf(message: any): string {
  const c = message?.content;
  return String(c?.text?.text || c?.caption?.text || c?.formatted_text?.text || '').trim();
}

async function ensureTdLibStarted(apiId: number, apiHash: string): Promise<string> {
  try {
    const state = String(await TdLib.getAuthorizationState());
    if (mapAuthState(state) !== 'closed') { started = true; return state; }
  } catch { /* No native client exists yet; initialise it below. */ }

  if (!startPending) {
    startPending = (async () => {
      await TdLib.startTdLib({ api_id: apiId, api_hash: apiHash });
      return String(await TdLib.getAuthorizationState());
    })();
  }
  const pending = startPending;
  try {
    const state = await pending;
    started = true;
    return state;
  } finally {
    if (startPending === pending) startPending = null;
  }
}

export async function startTelegram(credentials: Credentials, onMessage: (m: TelegramMessage) => void, onState: (s: AuthStep) => void): Promise<void> {
  if (!nativeModule || typeof (TdLib as any).startTdLib !== 'function') throw new Error('Modul Telegram belum terpasang di APK. Install APK terbaru yang menyertakan TDLib.');
  const apiId = Number(credentials.telegramApiId.trim());
  const apiHash = credentials.telegramApiHash.trim();
  if (!Number.isInteger(apiId) || apiId <= 0) throw new Error('Telegram API ID harus berupa angka bulat positif.');
  if (!/^[a-z0-9]{32}$/i.test(apiHash)) throw new Error('Telegram API Hash harus 32 karakter alfanumerik.');
  subscription?.remove();
  subscription = emitter.addListener('tdlib-update', (event: { raw?: string }) => {
    try {
      const raw = JSON.parse(event.raw || '{}') as Record<string, any>;
      if (raw['@type'] === 'updateAuthorizationState') onState(mapAuthState(String(raw.authorization_state?.['@type'] || raw.authorizationState?.['@type'] || '')));
      if (raw['@type'] === 'updateNewMessage') {
        const m = raw.message; const text = textOf(m); const chatId = m?.chat_id ?? m?.chatId;
        if (chatId && text) onMessage({ chatId: Number(chatId), messageId: Number(m.id), text, date: Number(m.date || 0), outgoing: Boolean(m.is_outgoing ?? m.isOutgoing) });
      }
    } catch { /* ignore non-JSON updates */ }
  });
  const state = await ensureTdLibStarted(apiId, apiHash);
  onState(mapAuthState(state));
}

export async function refreshAuthState(): Promise<AuthStep> { return mapAuthState(String(await TdLib.getAuthorizationState())); }

export async function loginTelegram(phoneNumber: string): Promise<void> {
  const n = phoneNumber.replace(/[\s-]/g, '');
  if (!/^\+\d{8,15}$/.test(n)) throw new Error('Nomor Telegram harus format internasional, contoh +628123456789.');
  const m = n.match(/^\+(\d{1,3})(\d+)$/);
  await TdLib.login({ countrycode: `+${m![1]}`, phoneNumber: m![2] });
}
export async function verifyTelegramCode(code: string): Promise<void> { if (!/^\d{4,8}$/.test(code.trim())) throw new Error('Kode Telegram tidak valid.'); await TdLib.verifyPhoneNumber(code.trim()); }
export async function verifyTelegramPassword(password: string): Promise<void> { if (!password.trim()) throw new Error('Password 2FA belum diisi.'); await TdLib.verifyPassword(password); }

export async function listTelegramChats(): Promise<TelegramChat[]> {
  if (!started) throw new Error('Telegram TDLib belum dimulai. Tekan Mulai TDLib terlebih dahulu.');
  await TdLib.loadChats(100);
  const parsed = JSON.parse(String(await TdLib.getChats(100)));
  const raw: Array<Record<string, any>> = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.chats) ? parsed.chats : [];
  const chats: TelegramChat[] = [];
  for (const chat of raw) {
    const t = JSON.stringify(chat.type || {});
    if (/Private|Secret/.test(t)) continue;
    const kind: TelegramChat['kind'] = /is_channel":true|isChannel":true/.test(t) ? 'Channel' : /Supergroup|BasicGroup/.test(t) ? 'Grup' : 'Chat';
    if (chat.id && chat.title) chats.push({ id: Number(chat.id), title: String(chat.title), kind, username: chat.username });
  }
  return chats;
}

export async function getTelegramHistory(chatId: number, limit = 30): Promise<TelegramMessage[]> {
  if (!started) throw new Error('Telegram TDLib belum dimulai.');
  const raw = await (TdLib as any).getChatHistory(chatId, 0, limit, 0);
  const parsedRaw = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const items = Array.isArray(parsedRaw) ? parsedRaw : parsedRaw?.messages || [];
  return items.map((item: any) => { const p = typeof item?.raw_json === 'string' ? JSON.parse(item.raw_json) : item; return { chatId, messageId: Number(p?.id || 0), text: textOf(p), date: Number(p?.date || 0), outgoing: Boolean(p?.is_outgoing) } as TelegramMessage; }).filter((m: TelegramMessage) => m.text);
}

export async function logoutTelegram(): Promise<void> { if (!started) return; await TdLib.logout(); started = false; subscription?.remove(); subscription = null; }
