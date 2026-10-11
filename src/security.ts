import * as Keychain from 'react-native-keychain';
import type { ExchangeId, ExchangeKeys } from './exchanges/types';

const SERVICE = 'com.tradepilotnative.credentials';
export const EXCHANGE_IDS: ExchangeId[] = ['bitget', 'bybit', 'okx', 'binance'];

export type Credentials = {
  telegramApiId: string;
  telegramApiHash: string;
  geminiApiKey: string;
  coingeckoKey: string;
  exchange: ExchangeId;
  keys: Record<ExchangeId, ExchangeKeys>;
};

const emptyKeys = (): ExchangeKeys => ({ apiKey: '', apiSecret: '', passphrase: '', env: 'mainnet' });
export const emptyCredentials = (): Credentials => ({
  telegramApiId: '', telegramApiHash: '', geminiApiKey: '', coingeckoKey: '', exchange: 'bitget',
  keys: { bitget: emptyKeys(), bybit: { ...emptyKeys(), env: 'testnet' }, okx: emptyKeys(), binance: emptyKeys() },
});
export const activeKeys = (c: Credentials): ExchangeKeys => c.keys[c.exchange];

/** Accepts the current shape and the older flat shapes (v1.x bitget*, bybit*). */
export function migrateCredentials(raw: Record<string, unknown>): Credentials {
  const base = emptyCredentials();
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  base.telegramApiId = str(raw.telegramApiId); base.telegramApiHash = str(raw.telegramApiHash); base.geminiApiKey = str(raw.geminiApiKey); base.coingeckoKey = str(raw.coingeckoKey);
  if (raw.keys && typeof raw.keys === 'object') {
    for (const id of EXCHANGE_IDS) {
      const k = (raw.keys as Record<string, Partial<ExchangeKeys>>)[id];
      if (k) base.keys[id] = { apiKey: str(k.apiKey), apiSecret: str(k.apiSecret), passphrase: str(k.passphrase), env: k.env === 'testnet' ? 'testnet' : 'mainnet' };
    }
    if (EXCHANGE_IDS.includes(raw.exchange as ExchangeId)) base.exchange = raw.exchange as ExchangeId;
    return base;
  }
  if (raw.bitgetApiKey) base.keys.bitget = { apiKey: str(raw.bitgetApiKey), apiSecret: str(raw.bitgetApiSecret), passphrase: str(raw.bitgetPassphrase), env: 'mainnet' };
  if (raw.bybitApiKey) { base.keys.bybit = { apiKey: str(raw.bybitApiKey), apiSecret: str(raw.bybitApiSecret), passphrase: '', env: raw.bybitEnvironment === 'mainnet' ? 'mainnet' : 'testnet' }; if (!raw.bitgetApiKey) base.exchange = 'bybit'; }
  return base;
}

export async function loadCredentials(): Promise<Credentials> {
  const item = await Keychain.getGenericPassword({ service: SERVICE });
  if (!item) return emptyCredentials();
  try { return migrateCredentials(JSON.parse(item.password)); } catch { return emptyCredentials(); }
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  await Keychain.setGenericPassword('tradepilot', JSON.stringify(credentials), { service: SERVICE, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function clearCredentials(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
