import * as Keychain from 'react-native-keychain';
import HmacSHA256 from 'crypto-js/hmac-sha256';
import Hex from 'crypto-js/enc-hex';

const SERVICE = 'com.tradepilotnative.lock';
const BIOMETRIC_SERVICE = `${SERVICE}.biometric`;
const BIOMETRIC_TOKEN = 'hyperlink-biometric-unlock-v1';
export const PIN_LENGTH = 6;
export const MAX_ATTEMPTS = 5;
export const LOCK_AFTER_MS = 30000;

export const isValidPin = (pin: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
const randomSalt = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('') + Date.now().toString(36);
/** Stretched HMAC: not a substitute for hardware biometrics, but keeps the PIN out of storage in plain text. */
export function hashPin(pin: string, salt: string, rounds = 2000): string {
  let h = HmacSHA256(pin, salt).toString(Hex);
  for (let i = 0; i < rounds; i += 1) h = HmacSHA256(h + pin, salt).toString(Hex);
  return h;
}
export const verifyPinHash = (pin: string, salt: string, hash: string) => hashPin(pin, salt) === hash;
/** Seconds to wait after `failures` wrong PINs (none for the first 2, then growing, capped at 5 min). */
export const lockoutSeconds = (failures: number): number => (failures < 3 ? 0 : Math.min(300, 15 * 2 ** (failures - 3)));
/** Whether the lock screen must be shown when returning to the app. */
export const shouldRelock = (leftAt: number | null, now: number, enabled: boolean): boolean => enabled && leftAt !== null && now - leftAt >= LOCK_AFTER_MS;

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`PIN harus ${PIN_LENGTH} digit angka.`);
  const salt = randomSalt();
  await Keychain.setGenericPassword('pin', JSON.stringify({ salt, hash: hashPin(pin, salt) }), { service: SERVICE, accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function checkPin(pin: string): Promise<boolean> {
  const item = await Keychain.getGenericPassword({ service: SERVICE });
  if (!item) return false;
  try { const { salt, hash } = JSON.parse(item.password) as { salt: string; hash: string }; return verifyPinHash(pin, salt, hash); } catch { return false; }
}
export async function hasPin(): Promise<boolean> { return Boolean(await Keychain.getGenericPassword({ service: SERVICE })); }

/** True when the current device reports an enrolled native biometric method (Android includes Fingerprint). */
export async function biometricUnlockAvailable(): Promise<boolean> {
  try { return Boolean(await Keychain.getSupportedBiometryType()); } catch { return false; }
}

/** Saves a non-secret unlock marker protected by the current enrolled biometric set, then verifies the prompt works. */
export async function enableBiometricUnlock(): Promise<void> {
  const supported = await Keychain.getSupportedBiometryType();
  if (!supported) throw new Error('Perangkat belum menyediakan sidik jari/biometrik yang terdaftar.');
  await Keychain.setGenericPassword('unlock', BIOMETRIC_TOKEN, {
    service: BIOMETRIC_SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    storage: Keychain.STORAGE_TYPE.AES_GCM,
  });
  const verified = await Keychain.getGenericPassword({
    service: BIOMETRIC_SERVICE,
    authenticationPrompt: { title: 'Aktifkan biometrik Hyperlink', subtitle: 'Konfirmasi dengan biometrik perangkat', cancel: 'Batal' },
  });
  if (!verified || verified.password !== BIOMETRIC_TOKEN) {
    await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE }).catch(() => undefined);
    throw new Error('Verifikasi biometrik gagal. PIN tetap dapat digunakan.');
  }
}

export async function disableBiometricUnlock(): Promise<void> {
  await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE });
}

/** Requests native Android BiometricPrompt; cancellation or failure leaves PIN fallback available. */
export async function authenticateBiometricUnlock(): Promise<boolean> {
  try {
    const item = await Keychain.getGenericPassword({
      service: BIOMETRIC_SERVICE,
      authenticationPrompt: { title: 'Buka Hyperlink', subtitle: 'Autentikasi untuk membuka aplikasi', cancel: 'Gunakan PIN' },
    });
    return Boolean(item && item.password === BIOMETRIC_TOKEN);
  } catch { return false; }
}

export async function clearPin(): Promise<void> {
  await Promise.all([
    Keychain.resetGenericPassword({ service: SERVICE }),
    Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE }).catch(() => undefined),
  ]);
}
