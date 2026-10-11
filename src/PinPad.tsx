import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Vibration, View, useWindowDimensions } from 'react-native';
import { PIN_LENGTH } from './lock';
import { playUiSound, useSoundConfig } from './sounds';
import { useTheme } from './theme';
import { Icon, Press, Txt } from './ui';

type PinStage = 'idle' | 'verifying' | 'verified';
type PinPadProps = {
  title: string;
  subtitle?: string;
  error?: string;
  disabled?: boolean;
  biometricEnabled?: boolean;
  biometricBusy?: boolean;
  onBiometricUnlock?: () => void;
  onComplete: (pin: string) => boolean | void | Promise<boolean | void>;
  onVerified?: () => void;
};

const BOX_H = 196;          // fixed height so the keypad never jumps
const TILE_MAX = 52;        // tiles are symmetric rounded squares (same width and height)
const ORBIT_R = 66;
const PARTICLES = 20;
const KEY_W = 86; const KEY_H = 68;

/**
 * PIN keypad with the "orbit" verification animation:
 * digits fill a row of tiles (caret on the active tile) → when complete the tiles glide onto a ring and spin while the PIN is checked →
 * correct: spin settles, tiles turn green, merge into one glowing square and burst into dots →
 * wrong: tiles flash red, glide back into the row, shake and clear.
 */
export function PinPad({ title, subtitle, error, disabled, biometricEnabled = false, biometricBusy = false, onBiometricUnlock, onComplete, onVerified }: PinPadProps) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const sound = useSoundConfig();
  const [pin, setPin] = useState('');
  const [stage, setStage] = useState<PinStage>('idle');
  const [orbiting, setOrbiting] = useState(false);
  const pop = useRef(Array.from({ length: PIN_LENGTH }, () => new Animated.Value(1))).current;
  const reveal = useRef(Array.from({ length: PIN_LENGTH }, () => new Animated.Value(0))).current;
  const caret = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;   // 0 = row, 1 = ring
  const spin = useRef(new Animated.Value(0)).current;    // turns of the ring
  const ok = useRef(new Animated.Value(0)).current;      // green overlay
  const bad = useRef(new Animated.Value(0)).current;     // red overlay
  const merge = useRef(new Animated.Value(0)).current;   // 0 = ring, 1 = single square
  const burst = useRef(new Animated.Value(0)).current;   // particles
  const squarePop = useRef(new Animated.Value(0)).current; // spring for the merged square
  const bump = useRef(new Animated.Value(0)).current;    // whole field squeezes on every key
  const prevLen = useRef(0);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const fieldWidth = Math.max(250, Math.min(344, width - 40));
  const tile = Math.min(TILE_MAX, Math.floor((fieldWidth - 6 * (PIN_LENGTH - 1)) / PIN_LENGTH));
  const tileR = Math.round(tile * 0.44);   // symmetric, nearly circular corners
  const gap = (fieldWidth - PIN_LENGTH * tile) / (PIN_LENGTH - 1);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '<'];
  const later = (fn: () => void, ms: number) => { const id = setTimeout(() => { if (mounted.current) fn(); }, ms); timers.current.push(id); };
  const run = (anim: Animated.CompositeAnimation) => new Promise<void>((resolve) => anim.start(() => resolve()));

  useEffect(() => {
    mounted.current = true;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(caret, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(caret, { toValue: 0.1, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { mounted.current = false; loop.stop(); timers.current.forEach(clearTimeout); [...pop, ...reveal, shake, orbit, spin, ok, bad, merge, burst, squarePop, bump].forEach((v) => v.stopAnimation()); };
  }, [caret, pop, reveal, shake, orbit, spin, ok, bad, merge, burst, squarePop, bump]);

  // new digit: tile bounces, digit shows briefly and then becomes a dot
  useEffect(() => {
    const was = prevLen.current; const now = pin.length; prevLen.current = now;
    if (now > was) {
      bump.setValue(1); Animated.spring(bump, { toValue: 0, damping: 10, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
      for (let i = was; i < now; i += 1) {
        pop[i].setValue(0.78); reveal[i].setValue(1);
        Animated.spring(pop[i], { toValue: 1, damping: 8, stiffness: 340, mass: 0.7, useNativeDriver: true }).start();
        Animated.timing(reveal[i], { toValue: 0, duration: 240, delay: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }
    } else if (now < was) {
      for (let i = now; i < was; i += 1) { pop[i].setValue(0.9); Animated.spring(pop[i], { toValue: 1, useNativeDriver: true }).start(); }
    }
  }, [pin, pop, reveal, bump]);

  useEffect(() => { if (!error || submitting.current) return; setPin(''); setStage('idle'); }, [error]);

  const settleSpin = () => new Promise<void>((resolve) => {
    spin.stopAnimation((v) => {
      const frac = v - Math.floor(v);
      if (frac < 0.02 || frac > 0.98) { spin.setValue(0); resolve(); return; }
      spin.setValue(frac);
      // overshoot a little, then bounce back onto the home position
      Animated.timing(spin, { toValue: 1, duration: 240 * (1 - frac) + 260, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start(() => { spin.setValue(0); resolve(); });
    });
  });
  const runShake = () => {
    shake.setValue(0);
    Animated.sequence([-1, 1, -0.7, 0.7, -0.4, 0.4, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 48, easing: Easing.linear, useNativeDriver: true }))).start();
  };

  const complete = useCallback(async (value: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setStage('verifying'); setOrbiting(true);
    ok.setValue(0); bad.setValue(0); merge.setValue(0); burst.setValue(0); spin.setValue(0); squarePop.setValue(0);
    const verification = Promise.resolve().then(() => onComplete(value)).then((r) => r !== false).catch(() => false);
    // 1) tiles glide from the row onto the ring
    // (a spring with overshoot; we move on once it has mostly landed instead of waiting out the tail)
    Animated.spring(orbit, { toValue: 1, damping: 12, stiffness: 220, mass: 0.8, useNativeDriver: true }).start();
    // 2) one continuous spin (eases in, fast middle, eases out) that overlaps the glide onto the ring
    await run(Animated.timing(spin, { toValue: 2, duration: 1000, delay: 120, easing: Easing.bezier(0.45, 0, 0.25, 1), useNativeDriver: true }));
    if (!mounted.current) return;
    const accepted = await verification;
    await settleSpin();
    if (!mounted.current) return;
    if (accepted) {
      // 3a) green, merge into one square, burst
      Animated.timing(ok, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      setStage('verified');
      playUiSound('confirm', sound);
      Animated.timing(burst, { toValue: 1, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      Animated.spring(squarePop, { toValue: 1, damping: 8, stiffness: 170, mass: 0.8, useNativeDriver: true }).start();
      await run(Animated.timing(merge, { toValue: 1, duration: 480, delay: 60, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
      submitting.current = false;
      later(() => { if (onVerified) onVerified(); else { setPin(''); setStage('idle'); setOrbiting(false); ok.setValue(0); merge.setValue(0); burst.setValue(0); orbit.setValue(0); } }, onVerified ? 700 : 1200);
      return;
    }
    // 3b) red flash, glide back to the row, shake, clear
    Vibration.vibrate([0, 40, 40, 60]);
    playUiSound('error', sound);
    await run(Animated.timing(bad, { toValue: 1, duration: 180, useNativeDriver: true }));
    runShake();
    await run(Animated.spring(orbit, { toValue: 0, damping: 12, stiffness: 200, mass: 0.8, useNativeDriver: true }));
    if (!mounted.current) return;
    setOrbiting(false); setStage('idle'); setPin('');
    Animated.timing(bad, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    submitting.current = false;
  }, [onComplete, onVerified, sound, orbit, spin, ok, bad, merge, burst, squarePop]);

  const press = (digit: string) => {
    if (disabled || stage !== 'idle' || submitting.current) return;
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) later(() => { void complete(next); }, 140);   // let the last tile land first
  };
  const active = Boolean(disabled || stage !== 'idle' || submitting.current || biometricBusy);
  const status = stage === 'verifying' ? 'Memeriksa PIN…' : stage === 'verified' ? 'Terverifikasi' : subtitle;
  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-14, 14] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const mergeInv = merge.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const tileFade = merge.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] });

  return <Animated.View style={{ alignItems: 'center' }}>
    <Txt variant="titleLarge" style={{ textAlign: 'center' }}>{title}</Txt>
    {status ? <Txt variant="bodySmall" color={stage === 'verified' ? t.success : t.onSurfaceVariant} style={{ marginTop: 4, textAlign: 'center' }}>{status}</Txt> : null}
    <Animated.View style={{ width: fieldWidth, height: BOX_H, marginTop: 10, marginBottom: 4, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: shakeX }, { scale: bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }] }}>
      {/* orbit track + centre dot */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: ORBIT_R * 2, height: ORBIT_R * 2, borderRadius: ORBIT_R, borderWidth: 1, borderColor: t.outlineVariant, opacity: Animated.multiply(orbit, mergeInv) }} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: t.outline, opacity: Animated.multiply(orbit, mergeInv) }} />
      {/* tiles (the whole group rotates while verifying) */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: fieldWidth, height: BOX_H, transform: [{ rotate: spinDeg }] }}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => {
          const rowX = (i - (PIN_LENGTH - 1) / 2) * (tile + gap);
          const a = -Math.PI / 2 + (i * Math.PI * 2) / PIN_LENGTH;
          const cx = Math.cos(a) * ORBIT_R; const cy = Math.sin(a) * ORBIT_R;
          const x = Animated.multiply(orbit.interpolate({ inputRange: [0, 1], outputRange: [rowX, cx] }), mergeInv);
          const yv = Animated.multiply(orbit.interpolate({ inputRange: [0, 1], outputRange: [0, cy] }), mergeInv);
          const sc = Animated.multiply(pop[i], orbit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }));
          const filled = i < pin.length;
          const isCaret = i === pin.length && stage === 'idle' && !orbiting;
          return <Animated.View key={i} style={{ position: 'absolute', left: fieldWidth / 2 - tile / 2, top: BOX_H / 2 - tile / 2, width: tile, height: tile, opacity: tileFade, transform: [{ translateX: x }, { translateY: yv }, { scale: sc }] }}>
            <View style={{ flex: 1, borderRadius: tileR, borderWidth: 1.5, borderColor: isCaret ? t.primary : filled ? t.outline : t.outlineVariant, backgroundColor: filled || isCaret ? t.surfaceContainer : t.surfaceHigh, alignItems: 'center', justifyContent: 'center', elevation: isCaret ? 3 : 0 }}>
              {filled ? <>
                <Animated.View style={{ position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: t.onSurface, opacity: reveal[i].interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }} />
                <Animated.View style={{ position: 'absolute', opacity: reveal[i] }}><Txt variant="titleLarge">{pin[i]}</Txt></Animated.View>
              </> : isCaret ? <Animated.View style={{ width: 2, height: 22, borderRadius: 1, backgroundColor: t.primary, opacity: caret }} /> : null}
            </View>
            <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: tileR, borderWidth: 1.5, borderColor: t.success, backgroundColor: t.successContainer, opacity: ok }} />
            <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: tileR, borderWidth: 1.5, borderColor: t.error, backgroundColor: t.errorContainer, opacity: bad }} />
          </Animated.View>;
        })}
      </Animated.View>
      {/* result: one glowing square + particles */}
      {stage === 'verified' ? <>
        {[0, 1].map((k) => <Animated.View key={k} pointerEvents="none" style={{ position: 'absolute', width: 76, height: 76, borderRadius: 28, borderWidth: 2 - k * 0.5, borderColor: t.success, opacity: burst.interpolate({ inputRange: [k * 0.2, 1], outputRange: [0.8, 0], extrapolate: 'clamp' }), transform: [{ scale: burst.interpolate({ inputRange: [k * 0.2, 1], outputRange: [1, 2.3 + k * 0.7], extrapolate: 'clamp' }) }] }} />)}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', width: 76, height: 76, borderRadius: 28, borderWidth: 2, borderColor: t.success, backgroundColor: t.successContainer, alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: t.success, shadowOpacity: 0.7, shadowRadius: 20, opacity: merge, transform: [{ scale: squarePop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
          <Icon name="check" size={34} color={t.onSuccessContainer} />
        </Animated.View>
        {Array.from({ length: PARTICLES }, (_, i) => {
          const a = (Math.PI * 2 * i) / PARTICLES + (i % 2) * 0.16; const dist = (i % 2 ? 84 : 56) + (i % 3) * 10;
          const size = i % 3 === 0 ? 6 : i % 2 ? 4 : 3;
          return <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: i % 4 === 0 ? t.primary : t.success, opacity: burst.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] }), transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * dist] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * dist] }) }, { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.3, 0.6] }) }] }} />;
        })}
      </> : null}
    </Animated.View>
    <View style={{ height: 20, marginBottom: 6 }}>{error ? <Txt variant="bodySmall" color={t.error} style={{ textAlign: 'center' }}>{error}</Txt> : null}</View>
    <View style={{ width: Math.min(KEY_W * 3 + 24, width - 32), flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, opacity: active ? 0.4 : 1 }}>
      {keys.map((key, index) => {
        if (key === '') return biometricEnabled && onBiometricUnlock
          ? <Pressable key={index} onPress={() => { setPin(''); onBiometricUnlock(); }} disabled={active} accessibilityRole="button" accessibilityLabel="Buka dengan biometrik" style={{ width: KEY_W, height: KEY_H, alignItems: 'center', justifyContent: 'center', opacity: active ? 0.5 : 1 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: t.secondaryContainer, alignItems: 'center', justifyContent: 'center' }}><Icon name="fingerprint" size={27} color={t.onSecondaryContainer} /></View>
            </Pressable>
          : <View key={index} style={{ width: KEY_W, height: KEY_H }} />;
        return <Press key={index} onPress={() => (key === '<' ? setPin((current) => current.slice(0, -1)) : press(key))} radius={KEY_H / 2} disabled={active}>
          <View style={{ width: KEY_W, height: KEY_H, borderRadius: KEY_H / 2, backgroundColor: key === '<' ? 'transparent' : t.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
            {key === '<' ? <Icon name="remove" size={22} color={t.onSurfaceVariant} /> : <Txt variant="titleLarge">{key}</Txt>}
          </View>
        </Press>;
      })}
    </View>
  </Animated.View>;
}
