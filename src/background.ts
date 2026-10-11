import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

type Native = { start: () => void; stop: () => void; isRunning: () => Promise<boolean>; notify?: (title: string, body: string, id: number) => void };
const native = NativeModules.TradePilotBackground as Native | undefined;

export function startBackgroundMonitoring(): void {
  if (Platform.OS !== 'android' || !native) throw new Error('Background monitoring hanya tersedia di build Android native.');
  native.start();
}
export function stopBackgroundMonitoring(): void { native?.stop(); }
export async function isBackgroundRunning(): Promise<boolean> { try { return Boolean(await native?.isRunning()); } catch { return false; } }
/** System notification for important events; no-op when the native module or permission is missing. */
export function showAlert(title: string, body: string, id = 0): void { try { native?.notify?.(title, body, id); } catch { /* best effort */ } }

export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  try { return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS); } catch { return false; }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  try {
    if (await hasNotificationPermission()) return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
      title: 'Izinkan notifikasi Hyperlink',
      message: 'Hyperlink menggunakan notifikasi lokal untuk signal, alert harga, dan perubahan order penting saat aplikasi atau monitoring masih berjalan.',
      buttonPositive: 'Izinkan',
      buttonNegative: 'Nanti',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return false; }
}
