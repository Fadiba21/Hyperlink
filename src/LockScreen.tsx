import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StyleSheet, View } from 'react-native';
import { authenticateBiometricUnlock, checkPin, lockoutSeconds, MAX_ATTEMPTS } from './lock';
import { PinPad } from './PinPad';
import { useTheme } from './theme';
import { Icon } from './ui';

/** Full-screen overlay shown until the PIN or an enrolled biometric is accepted. PIN lockout remains in force. */
export function LockScreen({ onUnlock, biometricEnabled = false }: { onUnlock: () => void; biometricEnabled?: boolean }) {
  const t = useTheme();
  const [failures, setFailures] = useState(0);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState('');
  const [bioBusy, setBioBusy] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => true); return () => sub.remove(); }, []);
  useEffect(() => {
    Animated.spring(entrance, { toValue: 1, damping: 18, stiffness: 170, mass: 0.8, useNativeDriver: true }).start();
  }, [entrance]);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait]);
  const submit = async (pin: string): Promise<boolean> => {
    if (wait > 0) return false;
    setError('');
    if (await checkPin(pin)) return true;
    const next = failures + 1;
    setFailures(next);
    const lock = lockoutSeconds(next);
    setWait(lock);
    setError(lock > 0 ? `PIN salah. Coba lagi dalam ${lock} detik.` : `PIN salah (${next}/${MAX_ATTEMPTS}).`);
    return false;
  };
  const unlockBiometric = async () => {
    if (bioBusy) return;
    setBioBusy(true); setError('');
    try {
      if (await authenticateBiometricUnlock()) onUnlock();
      else setError('Biometrik dibatalkan atau tidak cocok. Gunakan PIN.');
    } finally { setBioBusy(false); }
  };
  return <View style={[StyleSheet.absoluteFill, { zIndex: 900, elevation: 900, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
    <Animated.View style={{ alignItems: 'center', opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
      <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: t.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 18, elevation: 8 }}><Icon name="lock" size={30} color={t.onPrimaryContainer} /></View>
      <PinPad title="Masukkan PIN" subtitle={biometricEnabled ? 'Biometrik di kiri angka 0 · PIN enam digit' : 'Hyperlink terkunci'} error={wait > 0 ? `Tunggu ${wait} detik` : error} disabled={wait > 0} biometricEnabled={biometricEnabled} biometricBusy={bioBusy} onBiometricUnlock={() => { void unlockBiometric(); }} onComplete={submit} onVerified={onUnlock} />
    </Animated.View>
  </View>;
}
