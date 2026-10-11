import { createContext, useContext } from 'react';
import { NativeModules, Platform } from 'react-native';

export const SOUND_TEMPLATES = [
  { id: 'soft', label: 'Lembut', detail: 'Klik dan konfirmasi halus' },
  { id: 'crisp', label: 'Crisp', detail: 'Feedback jelas dan singkat' },
  { id: 'wallet', label: 'Wallet', detail: 'Nuansa kaca/pluck untuk aksi utama' },
  { id: 'deep', label: 'Deep 70–140 Hz', detail: 'Nada bass lembut 70–140 Hz dengan harmonik pendek agar tetap terdengar jelas.' },
  { id: 'piano', label: 'Piano', detail: 'Nada piano sintetis dengan pitch yang bervariasi.' },
  { id: 'harp', label: 'Harp', detail: 'Pluck harp yang berkilau dengan pitch yang bervariasi.' },
  { id: 'violin', label: 'Violin', detail: 'Nada violin berkelanjutan dengan pitch yang bervariasi.' },
  { id: 'cello', label: 'Cello', detail: 'Nada cello hangat dengan pitch yang bervariasi.' },
  { id: 'acoustic-guitar', label: 'Acoustic guitar', detail: 'Petikan gitar akustik dengan pitch yang bervariasi.' },
  { id: 'deafdeep', label: 'DeafDeep', detail: 'Paket lima efek suara lokal dari click.wav, anything.wav, PinUnlock.wav, order.wav, dan Notif,PopUp.wav.' },
] as const;
export type SoundTemplate = typeof SOUND_TEMPLATES[number]['id'];
export type UiSoundEffect = 'tap' | 'select' | 'toggle' | 'adjust' | 'open' | 'confirm' | 'error' | 'notify';
export type SoundConfig = { enabled: boolean; template: SoundTemplate; volume: number };

export const DEFAULT_SOUND_CONFIG: SoundConfig = { enabled: true, template: 'deafdeep', volume: 0.45 };
export const SoundContext = createContext<SoundConfig>(DEFAULT_SOUND_CONFIG);
export const useSoundConfig = () => useContext(SoundContext);

type NativeSoundModule = { play: (effect: UiSoundEffect, template: SoundTemplate, volume: number) => void };

export function playUiSound(effect: UiSoundEffect, config: SoundConfig = DEFAULT_SOUND_CONFIG): void {
  if (!config.enabled || Platform.OS !== 'android') return;
  const native = (NativeModules as typeof NativeModules & { HyperlinkSounds?: NativeSoundModule }).HyperlinkSounds;
  if (!native) return;
  try { native.play(effect, config.template, Math.max(0, Math.min(1, config.volume))); } catch { /* Sound is decorative; never interrupt a user action. */ }
}
