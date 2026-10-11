import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, View } from 'react-native';
import { DIAL_START_DEG, DIAL_SWEEP_DEG, guardWrap, knobOffset, ratioFromPoint, ratioOfValue, valueAtRatio } from './dial';
import { playUiSound, useSoundConfig } from './sounds';
import { useTheme } from './theme';
import { Press, Txt } from './ui';

const DOTS = 37;

type DialProps = {
  value: number; min: number; max: number; step?: number; onChange: (value: number) => void;
  label: string; format?: (value: number) => string; size?: number; color?: string; disabled?: boolean;
};

/**
 * Analog rotary dial in the visual language of the pull-to-refresh indicator: a ring of dots that fill as the
 * value rises, a draggable knob, and a big readout in the middle. Drag around the ring (or use − / +).
 */
function DialImpl({ value, min, max, step = 1, onChange, label, format, size = 140, color, disabled }: DialProps) {
  const t = useTheme();
  const sound = useSoundConfig();
  const accent = color || t.primary;
  const R = size / 2 - 12;
  const ratio = ratioOfValue(value, min, max);
  const progress = useRef(new Animated.Value(ratio)).current;
  const knobScale = useRef(new Animated.Value(1)).current;
  const dragging = useRef(false);
  const lastRatio = useRef(ratio);
  const latest = useRef({ min, max, step, value, onChange, sound, disabled });
  latest.current = { min, max, step, value, onChange, sound, disabled };
  // The readout lives in local state so a drag only re-renders this small component; the parent is told at most
  // every ~90ms while dragging (plus once on release), which keeps big forms like the order card smooth.
  const [shown, setShown] = useState(value);
  const lastEmit = useRef(0);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!dragging.current) setShown(value); }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null) { const v = pending.current; pending.current = null; lastEmit.current = Date.now(); latest.current.onChange(v); }
  };
  const emit = (v: number) => {
    pending.current = v;
    const wait = 90 - (Date.now() - lastEmit.current);
    if (wait <= 0) flush(); else if (!timer.current) timer.current = setTimeout(flush, wait);
  };

  useEffect(() => {
    if (dragging.current) return;
    lastRatio.current = ratio;
    Animated.timing(progress, { toValue: ratio, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [ratio, progress]);

  const apply = (raw: number) => {
    const { min: lo, max: hi, step: st, value: cur } = latest.current;
    const guarded = guardWrap(lastRatio.current, raw);
    lastRatio.current = guarded;
    progress.setValue(guarded);
    const next = valueAtRatio(guarded, lo, hi, st);
    if (next !== cur) { latest.current.value = next; setShown(next); emit(next); }
  };
  const fromEvent = (x: number, y: number) => ratioFromPoint(x - size / 2, y - size / 2);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onMoveShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      dragging.current = true;
      // A fresh touch may jump anywhere on the ring; only the first sample is exempt from the wrap guard.
      lastRatio.current = fromEvent(e.nativeEvent.locationX, e.nativeEvent.locationY);
      apply(lastRatio.current);
      Animated.spring(knobScale, { toValue: 1.25, speed: 26, bounciness: 4, useNativeDriver: true }).start();
    },
    onPanResponderMove: (e) => apply(fromEvent(e.nativeEvent.locationX, e.nativeEvent.locationY)),
    onPanResponderRelease: () => {
      dragging.current = false; flush();
      const { min: lo, max: hi, step: st } = latest.current;
      const snapped = ratioOfValue(valueAtRatio(lastRatio.current, lo, hi, st), lo, hi);
      lastRatio.current = snapped;
      Animated.spring(progress, { toValue: snapped, speed: 20, bounciness: 3, useNativeDriver: true }).start();
      Animated.spring(knobScale, { toValue: 1, speed: 24, bounciness: 4, useNativeDriver: true }).start();
      playUiSound('adjust', latest.current.sound);
    },
    onPanResponderTerminate: () => { dragging.current = false; flush(); Animated.spring(knobScale, { toValue: 1, useNativeDriver: true }).start(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [progress, knobScale, size]);

  const nudge = (dir: number) => {
    if (disabled) return;
    const next = Math.max(min, Math.min(max, Number((value + dir * step).toFixed(6))));
    if (next !== value) { setShown(next); latest.current.value = next; onChange(next); }
  };
  const outline = t.outline;
  const dots = useMemo(() => Array.from({ length: DOTS }, (_, i) => {
    const a = ((DIAL_START_DEG + (i / (DOTS - 1)) * DIAL_SWEEP_DEG) * Math.PI) / 180;
    const major = i % 6 === 0;
    const d = major ? 6.4 : 4.6;
    const style = { position: 'absolute' as const, left: size / 2 + Math.cos(a) * R - d / 2, top: size / 2 + Math.sin(a) * R - d / 2, width: d, height: d, borderRadius: d / 2 };
    const filled = progress.interpolate({ inputRange: [(i - 0.5) / (DOTS - 1), (i + 0.5) / (DOTS - 1)], outputRange: [0, 1], extrapolate: 'clamp' });
    return <View key={i} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
      <View style={[style, { backgroundColor: outline, opacity: major ? 0.5 : 0.28 }]} />
      <Animated.View style={[style, { backgroundColor: accent, opacity: filled }]} />
    </View>;
  }), [size, R, accent, outline, progress]);
  const knobRotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${DIAL_SWEEP_DEG}deg`] });
  const start = knobOffset(0, R);
  const text = format ? format(shown) : String(shown);

  return <View style={{ alignItems: 'center', opacity: disabled ? 0.45 : 1 }}>
    <View {...pan.panHandlers} style={{ width: size, height: size }}>
      {/* ring of dots: faint track + accent fill driven by `progress` (same idea as the pull gauge) */}
      {dots}
      {/* knob: a rotating arm so the native driver moves it along the arc */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: [{ rotate: knobRotate }] }}>
        <Animated.View style={{ position: 'absolute', left: size / 2 + start.x - 11, top: size / 2 + start.y - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: accent, borderWidth: 3, borderColor: t.surface, elevation: 4, transform: [{ scale: knobScale }] }} />
      </Animated.View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Txt variant="labelSmall" color={t.onSurfaceVariant}>{label}</Txt>
        <Txt variant="headline" color={t.onSurface} style={{ fontSize: size > 120 ? 28 : 22, lineHeight: size > 120 ? 34 : 28, fontWeight: '700' }}>{text}</Txt>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
        {([-1, 1] as const).map((dir) => <Press key={dir} onPress={() => nudge(dir)} radius={13} disabled={disabled}><View style={{ width: 28, height: 26, borderRadius: 13, backgroundColor: t.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}><Txt variant="label" color={t.onSurfaceVariant}>{dir < 0 ? '−' : '+'}</Txt></View></Press>)}
      </View>
    </View>
  </View>;
}

/** Re-render only when the visible inputs change; callbacks are read through refs so inline lambdas don't defeat this. */
export const Dial = memo(DialImpl, (a, b) => a.value === b.value && a.min === b.min && a.max === b.max && a.step === b.step && a.label === b.label && a.size === b.size && a.color === b.color && a.disabled === b.disabled);
