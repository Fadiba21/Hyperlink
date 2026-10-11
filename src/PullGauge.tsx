import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import type { Theme } from './theme';
import { Icon } from './ui';

export type PullPhase = 'idle' | 'pull' | 'armed' | 'holding' | 'switched' | 'loading';
export const PULL_ARM = 70;        // raw finger distance (px) that arms refresh
export const PULL_MAX = 64;        // max content offset
export const HOLD_MS = 3200;       // hold time (after the refresh icon is armed) to switch account mode
export const pullOffset = (dy: number): number => Math.max(0, Math.min(PULL_MAX, dy * 0.6));

const DOTS = 12;
const RADIUS = 12.5;

export function PullGauge({ pullY, hold, ripple, phase, target, seconds, theme }: { pullY: Animated.Value; hold: Animated.Value; ripple: Animated.Value; phase: PullPhase; target: 'Demo' | 'Live'; seconds: number; theme: Theme }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'loading') { spin.stopAnimation(); spin.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [phase, spin]);
  const loading = phase === 'loading';
  const caption = phase === 'pull' ? 'Tarik untuk refresh' : phase === 'armed' ? `Lepas: refresh · tahan: ${target}` : phase === 'holding' ? `Tahan ${seconds}s · ${target}` : phase === 'switched' ? `${target} aktif` : loading ? 'Memperbarui…' : '';
  const opacity = pullY.interpolate({ inputRange: [0, 18, 36], outputRange: [0, 0.72, 1], extrapolate: 'clamp' });
  const scale = pullY.interpolate({ inputRange: [0, 36, PULL_MAX], outputRange: [0.82, 1, 1.02], extrapolate: 'clamp' });
  const tilt = pullY.interpolate({ inputRange: [0, PULL_MAX], outputRange: ['0deg', '250deg'], extrapolate: 'clamp' });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rippleScale = ripple.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.9] });
  const rippleOpacity = ripple.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', zIndex: 20, top: 4, alignSelf: 'center', maxWidth: '94%', minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 26, borderWidth: 1, borderColor: theme.outlineVariant, backgroundColor: theme.surfaceHigh, elevation: 3, opacity, transform: [{ scale }] }}>
    <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary, opacity: rippleOpacity, transform: [{ scale: rippleScale }] }} />
      <Animated.View style={{ position: 'absolute', width: 36, height: 36, transform: [{ rotate: loading ? spinDeg : tilt }] }}>
        {Array.from({ length: DOTS }, (_, i) => {
          const a = (Math.PI * 2 * i) / DOTS - Math.PI / 2;
          const dot = { position: 'absolute' as const, left: 18 - 2.6 + Math.cos(a) * RADIUS, top: 18 - 2.6 + Math.sin(a) * RADIUS, width: 5.2, height: 5.2, borderRadius: 2.6 };
          const track = pullY.interpolate({ inputRange: [0, PULL_MAX * ((i + 1) / DOTS)], outputRange: [0.18, 0.9], extrapolate: 'clamp' });
          const filled = hold.interpolate({ inputRange: [i / DOTS, (i + 1) / DOTS], outputRange: [0, 1], extrapolate: 'clamp' });
          return <View key={i} style={{ position: 'absolute', left: 0, top: 0, width: 36, height: 36 }}>
            <Animated.View style={[dot, { backgroundColor: theme.outline, opacity: loading ? 0.25 : track }]} />
            <Animated.View style={[dot, { backgroundColor: theme.primary, opacity: loading ? (i < 5 ? 1 - i * 0.18 : 0) : filled }]} />
          </View>;
        })}
      </Animated.View>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.secondaryContainer, alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'holding' && seconds > 0 ? <Text style={{ color: theme.onSecondaryContainer, fontSize: 11, fontWeight: '800' }}>{seconds}</Text> : <Icon name={phase === 'switched' ? 'check' : 'refresh'} size={16} color={theme.onSecondaryContainer} />}
      </View>
    </View>
    <Text numberOfLines={1} style={{ color: theme.onSurface, fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.1, flexShrink: 1 }}>{caption}</Text>
  </Animated.View>;
}
