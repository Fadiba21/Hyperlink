import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, BackHandler, Easing, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View, type StyleProp, type TextInputProps, type ViewInstance, type ViewStyle } from 'react-native';
import { ICON_SHAPES, type IconName, type Shape } from './icons';
import { BlurView } from '@react-native-community/blur';
import { type } from './theme';
import { useTheme, type Theme } from './theme';
import { playUiSound, useSoundConfig } from './sounds';
import { clampSliderRatio, sliderValueAtRatio } from './slider';

export type { IconName };

function colorWithAlpha(color: string, alpha: number): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function ShapeView({ shape, s, color }: { shape: Shape; s: number; color: string }) {
  const u = (n: number) => n * s;
  if (shape.t === 'b') return <View style={{ position: 'absolute', left: u(shape.x), top: u(shape.y), width: u(shape.w), height: u(shape.h), borderRadius: u(shape.r || 0), backgroundColor: color, transform: shape.rot ? [{ rotate: `${shape.rot}deg` }] : undefined }} />;
  if (shape.t === 'o') return <View style={{ position: 'absolute', left: u(shape.x), top: u(shape.y), width: u(shape.w), height: u(shape.h), borderRadius: u(shape.r || 0), borderWidth: u(shape.sw), borderColor: color }} />;
  if (shape.t === 'c') return <View style={{ position: 'absolute', left: u(shape.cx - shape.r), top: u(shape.cy - shape.r), width: u(shape.r * 2), height: u(shape.r * 2), borderRadius: u(shape.r), backgroundColor: color }} />;
  if (shape.t === 'k') return <View style={{ position: 'absolute', left: u(shape.cx - shape.r), top: u(shape.cy - shape.r), width: u(shape.r * 2), height: u(shape.r * 2), borderRadius: u(shape.r), borderWidth: u(shape.sw), borderColor: color }} />;
  if (shape.t === 'g') return <View style={{ position: 'absolute', left: u(shape.cx - shape.r), top: u(shape.cy - shape.r), width: u(shape.r * 2), height: u(shape.r * 2), borderRadius: u(shape.r), borderWidth: u(shape.sw), borderColor: color, borderRightColor: 'transparent', transform: [{ rotate: `${shape.rot}deg` }] }} />;
  const w = u(shape.w); const h = u(shape.h);
  const base = { position: 'absolute' as const, left: u(shape.x), top: u(shape.y), width: 0, height: 0, borderStyle: 'solid' as const, borderColor: 'transparent' };
  if (shape.d === 'u') return <View style={{ ...base, borderLeftWidth: w / 2, borderRightWidth: w / 2, borderBottomWidth: h, borderBottomColor: color }} />;
  if (shape.d === 'd') return <View style={{ ...base, borderLeftWidth: w / 2, borderRightWidth: w / 2, borderTopWidth: h, borderTopColor: color }} />;
  if (shape.d === 'r') return <View style={{ ...base, borderTopWidth: h / 2, borderBottomWidth: h / 2, borderLeftWidth: w, borderLeftColor: color }} />;
  return <View style={{ ...base, borderTopWidth: h / 2, borderBottomWidth: h / 2, borderRightWidth: w, borderRightColor: color }} />;
}

export function Icon({ name, color, size = 24 }: { name: IconName; color?: string; size?: number }) {
  const t = useTheme();
  const c = color || t.onSurfaceVariant;
  const s = size / 24;
  const shapes = ICON_SHAPES[name] as readonly Shape[];
  return <View style={{ width: size, height: size }}>{shapes.map((shape, i) => <ShapeView key={i} shape={shape} s={s} color={c} />)}</View>;
}

/* ---------- animation helpers ---------- */
export function Reveal({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 360, delay: Math.min(index, 8) * 55, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, index]);
  return <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }, style]}>{children}</Animated.View>;
}

export function ScreenTransition({ children, dir = 0 }: { children: ReactNode; dir?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 210, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, dir]);
  const offset = dir < 0 ? -10 : 10;
  return <Animated.View style={{ flex: 1, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] }}>{children}</Animated.View>;
}

export function Press({ onPress, onLongPress, disabled, style, children, radius = 16, scaleTo = 0.97, rippleColor }: { onPress?: () => void; onLongPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode; radius?: number; scaleTo?: number; rippleColor?: string }) {
  const t = useTheme();
  const sound = useSoundConfig();
  const s = useRef(new Animated.Value(1)).current;
  const to = (value: number) => Animated.spring(s, { toValue: value, speed: 40, bounciness: 4, useNativeDriver: true }).start();
  return (
    <Animated.View style={[{ transform: [{ scale: s }], borderRadius: radius, overflow: 'hidden', opacity: disabled ? 0.45 : 1 }, style]}>
      <Pressable disabled={disabled || !onPress} onPress={() => { if (onPress) { playUiSound('tap', sound); onPress(); } }} onLongPress={onLongPress} onPressIn={() => to(scaleTo)} onPressOut={() => to(1)} android_ripple={{ color: rippleColor || t.ripple }} accessibilityRole="button">
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 1100, useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 1100, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size * 2.2, height: size * 2.2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size * 2.2, height: size * 2.2, borderRadius: size * 1.1, backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

export function LinearProgress({ active }: { active: boolean }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!active) { v.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 3, overflow: 'hidden', backgroundColor: active ? t.primaryContainer : 'transparent' }}>
      {active ? <Animated.View style={{ height: 3, width: width * 0.4, backgroundColor: t.primary, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.4, width] }) }] }} /> : null}
    </View>
  );
}

export function CountUp({ value, format, style }: { value: number; format: (n: number) => string; style?: object }) {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = v.addListener(({ value: n }) => setShown(n));
    Animated.timing(v, { toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [value, v]);
  return <Text style={style}>{format(shown)}</Text>;
}

/* ---------- basic building blocks ---------- */
export function Card({ children, onPress, tone = 'container', style }: { children: ReactNode; onPress?: () => void; tone?: 'container' | 'high' | 'outlined' | 'primary' | 'error'; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const bg = tone === 'high' ? t.surfaceHigh : tone === 'primary' ? t.primaryContainer : tone === 'error' ? t.errorContainer : tone === 'outlined' ? t.surface : t.surfaceContainer;
  const body = <View style={[{ backgroundColor: bg, padding: 16, borderRadius: 20, borderWidth: tone === 'outlined' ? 1 : 0, borderColor: t.outlineVariant }, style]}>{children}</View>;
  if (!onPress) return <View style={{ marginBottom: 12 }}>{body}</View>;
  return <Press onPress={onPress} radius={20} style={{ marginBottom: 12 }}>{body}</Press>;
}

export function Txt({ variant = 'body', color, children, style, numberOfLines }: { variant?: keyof typeof type; color?: string; children: ReactNode; style?: StyleProp<object>; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[type[variant], { color: color || t.onSurface }, style]}>{children}</Text>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 8, paddingHorizontal: 4, minHeight: 32 }}>
      <Txt variant="titleSmall" color={t.primary}>{title}</Txt>
      {action ? <Press onPress={onAction} radius={16}><View style={{ paddingHorizontal: 10, paddingVertical: 6 }}><Txt variant="label" color={t.primary}>{action}</Txt></View></Press> : null}
    </View>
  );
}

type BtnVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';
export function Btn({ label, onPress, variant = 'filled', icon, loading, disabled, flex, style }: { label: string; onPress: () => void; variant?: BtnVariant; icon?: IconName; loading?: boolean; disabled?: boolean; flex?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const palette = {
    filled: { bg: t.primary, fg: t.onPrimary, border: 'transparent' }, tonal: { bg: t.secondaryContainer, fg: t.onSecondaryContainer, border: 'transparent' },
    outlined: { bg: 'transparent', fg: t.primary, border: t.outline }, text: { bg: 'transparent', fg: t.primary, border: 'transparent' }, danger: { bg: t.errorContainer, fg: t.onErrorContainer, border: 'transparent' },
  }[variant];
  return (
    <Press onPress={loading ? undefined : onPress} disabled={disabled} radius={20} rippleColor={palette.fg + '33'} style={[{ flex: flex ? 1 : undefined, marginTop: 8 }, style]}>
      <View style={{ minHeight: 40, paddingHorizontal: 20, borderRadius: 20, backgroundColor: palette.bg, borderWidth: variant === 'outlined' ? 1 : 0, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {loading ? <ActivityIndicator size="small" color={palette.fg} /> : icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
        <Text style={[type.label, { color: palette.fg }]}>{label}</Text>
      </View>
    </Press>
  );
}

export function IconBtn({ icon, onPress, color, label }: { icon: IconName; onPress: () => void; color?: string; label?: string }) {
  return (
    <Press onPress={onPress} radius={20} scaleTo={0.9}>
      <View accessibilityLabel={label} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} color={color} size={24} /></View>
    </Press>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Press onPress={onPress} radius={8} style={{ marginRight: 8 }}>
      <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: selected ? t.secondaryContainer : 'transparent', borderWidth: selected ? 0 : 1, borderColor: t.outline }}>
        {selected ? <Icon name="check" size={16} color={t.onSecondaryContainer} /> : icon ? <Icon name={icon} size={16} /> : null}
        <Text style={[type.label, { color: selected ? t.onSecondaryContainer : t.onSurfaceVariant }]}>{label}</Text>
      </View>
    </Press>
  );
}

export type PresetPopoverOption<T extends string = string> = { id: T; label: string; subtitle?: string; disabled?: boolean };

/** A single selected chip that opens its existing one-choice preset group in a small anchored popover. */
export function PresetPopover<T extends string>({ value, options, onSelect }: { value: T; options: readonly PresetPopoverOption<T>[]; onSelect: (id: T) => void }) {
  const t = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const anchorRef = useRef<ViewInstance>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 240, maxHeight: 300 });
  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    if (!mounted) return undefined;
    const animation = open
      ? Animated.spring(progress, { toValue: 1, damping: 22, stiffness: 260, mass: 0.72, useNativeDriver: true })
      : Animated.timing(progress, { toValue: 0, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished && !open) setMounted(false); });
    return () => animation.stop();
  }, [mounted, open, progress]);

  const show = () => anchorRef.current?.measureInWindow((x, y, _width, height) => {
    const width = Math.max(180, Math.min(288, windowWidth - 24));
    const maxHeight = Math.max(160, Math.min(340, windowHeight - 32));
    const estimatedHeight = Math.min(maxHeight, 12 + options.reduce((sum, option) => sum + (option.subtitle ? 58 : 44), 0));
    const left = Math.max(12, Math.min(x, windowWidth - width - 12));
    const below = y + height + 8;
    const top = below + estimatedHeight <= windowHeight - 12 ? below : Math.max(12, y - estimatedHeight - 8);
    setPosition({ left, top, width, maxHeight });
    setMounted(true);
    setOpen(true);
  });
  const close = () => setOpen(false);

  if (!options.length) return null;
  return <>
    <View ref={anchorRef} collapsable={false} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Press onPress={show} radius={18}>
        <View style={{ minHeight: 36, maxWidth: windowWidth - 24, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 18, backgroundColor: t.secondaryContainer, borderWidth: 1, borderColor: t.outlineVariant }}>
          <Text numberOfLines={1} style={[type.label, { color: t.onSecondaryContainer, flexShrink: 1 }]}>{selected?.label || value}</Text>
          <Icon name="chevron" size={15} color={t.onSecondaryContainer} />
        </View>
      </Press>
    </View>
    {mounted ? <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View pointerEvents="box-none" style={[absoluteFill, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.10] }), backgroundColor: t.scrim }]}>
          <Pressable onPress={close} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View style={{ position: 'absolute', left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, padding: 6, borderRadius: 16, borderWidth: 1, borderColor: t.outlineVariant, backgroundColor: t.surfaceLow, elevation: 14, shadowColor: '#000', shadowOpacity: 0.20, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-5, 0] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {options.map((option) => {
              const isSelected = option.id === value;
              return <Press key={option.id} disabled={option.disabled} onPress={() => { onSelect(option.id); close(); }} radius={10}>
                <View style={{ minHeight: option.subtitle ? 56 : 42, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: isSelected ? t.secondaryContainer : 'transparent', opacity: option.disabled ? 0.45 : 1 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" color={isSelected ? t.onSecondaryContainer : t.onSurface} numberOfLines={1}>{option.label}</Txt>
                    {option.subtitle ? <Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={2}>{option.subtitle}</Txt> : null}
                  </View>
                  {isSelected ? <Icon name="check" size={18} color={t.primary} /> : null}
                </View>
              </Press>;
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal> : null}
  </>;
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'info';
export function Pill({ label, tone = 'neutral', pulse }: { label: string; tone?: Tone; pulse?: boolean }) {
  const t = useTheme();
  const c = { good: [t.successContainer, t.onSuccessContainer], warn: [t.warningContainer, t.onWarningContainer], bad: [t.errorContainer, t.onErrorContainer], neutral: [t.surfaceHigh, t.onSurfaceVariant], info: [t.primaryContainer, t.onPrimaryContainer] }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: c[0] }}>
      {pulse ? <PulseDot color={c[1]} size={6} /> : null}
      <Text style={[type.labelSmall, { color: c[1] }]}>{label}</Text>
    </View>
  );
}

export function Empty({ icon, title, copy }: { icon: IconName; title: string; copy: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 28, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: t.outlineVariant, marginBottom: 12 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={28} /></View>
      <Txt variant="titleMedium" style={{ marginTop: 12, textAlign: 'center' }}>{title}</Txt>
      <Txt variant="body" color={t.onSurfaceVariant} style={{ marginTop: 4, textAlign: 'center' }}>{copy}</Txt>
    </View>
  );
}

export function ListRow({ icon, title, subtitle, trailing, onPress, tint }: { icon: IconName; title: string; subtitle?: string; trailing?: ReactNode; onPress?: () => void; tint?: string }) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8, gap: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.primaryContainer, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={tint || t.onPrimaryContainer} /></View>
      <View style={{ flex: 1 }}>
        <Txt variant="titleMedium" numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="body" color={t.onSurfaceVariant} numberOfLines={2}>{subtitle}</Txt> : null}
      </View>
      {trailing}
    </View>
  );
  return onPress ? <Press onPress={onPress} radius={12}>{body}</Press> : body;
}

/* ---------- text field (Material outlined, floating label) ---------- */
export function Field({ label, value, onChangeText, secure, helper, ...rest }: { label: string; value: string; onChangeText: (v: string) => void; secure?: boolean; helper?: string } & Omit<TextInputProps, 'value' | 'onChangeText' | 'secureTextEntry'>) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(Boolean(secure));
  const a = useRef(new Animated.Value(value ? 1 : 0)).current;
  const up = focused || value.length > 0;
  useEffect(() => { Animated.timing(a, { toValue: up ? 1 : 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(); }, [up, a]);
  const multiline = Boolean(rest.multiline);
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ minHeight: multiline ? 110 : 56, borderRadius: 4, borderWidth: focused ? 2 : 1, borderColor: focused ? t.primary : t.outline, justifyContent: multiline ? 'flex-start' : 'center', paddingHorizontal: 14 - (focused ? 1 : 0) }}>
        <Animated.Text pointerEvents="none" style={{ position: 'absolute', left: 12, paddingHorizontal: 4, backgroundColor: t.surfaceContainer, color: focused ? t.primary : t.onSurfaceVariant, top: a.interpolate({ inputRange: [0, 1], outputRange: [multiline ? 16 : 17, -10] }), fontSize: a.interpolate({ inputRange: [0, 1], outputRange: [16, 12] }) }}>{label}</Animated.Text>
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={hidden}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          autoCapitalize={rest.autoCapitalize || 'none'}
          autoCorrect={false}
          cursorColor={t.primary}
          selectionColor={t.primary}
          style={[{ color: t.onSurface, fontSize: 16, paddingVertical: multiline ? 18 : 8, paddingRight: secure ? 36 : 0, textAlignVertical: multiline ? 'top' : 'center', minHeight: multiline ? 100 : undefined }]}
        />
        {secure ? <View style={{ position: 'absolute', right: 4, top: 6 }}><IconBtn icon={hidden ? 'eye' : 'eyeOff'} onPress={() => setHidden((h) => !h)} label="Tampilkan/sembunyikan" /></View> : null}
      </View>
      {helper ? <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 4, marginLeft: 16 }}>{helper}</Txt> : null}
    </View>
  );
}

/* ---------- slider ---------- */
export function Slider({ value, min, max, onChange, format }: { value: number; min: number; max: number; onChange: (n: number) => void; format?: (n: number) => string }) {
  const t = useTheme();
  const sound = useSoundConfig();
  const widthRef = useRef(1);
  const [width, setWidth] = useState(25);
  const scale = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const dragging = useRef(false);
  const startX = useRef(0);
  const ratio = clampSliderRatio((value - min) / (max - min || 1));
  const latest = useRef({ min, max, value, onChange, sound });
  latest.current = { min, max, value, onChange, sound };
  const trackWidth = Math.max(1, width - 24);
  useEffect(() => {
    if (dragging.current) return;
    progress.stopAnimation();
    Animated.timing(progress, { toValue: ratio, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress, ratio]);
  const setRatio = (nextRatio: number) => {
    const normalized = clampSliderRatio(nextRatio);
    progress.setValue(normalized);
    const { min: lo, max: hi, value: current, onChange: cb } = latest.current;
    const next = sliderValueAtRatio(normalized, lo, hi);
    if (next !== current) cb(next);
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      dragging.current = true;
      startX.current = Math.max(0, Math.min(widthRef.current, e.nativeEvent.locationX - 12));
      setRatio(startX.current / widthRef.current);
      Animated.spring(scale, { toValue: 1.22, speed: 24, bounciness: 3, useNativeDriver: true }).start();
    },
    onPanResponderMove: (_e, gesture) => setRatio((startX.current + gesture.dx) / widthRef.current),
    onPanResponderRelease: () => { dragging.current = false; Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 3, useNativeDriver: true }).start(); playUiSound('adjust', latest.current.sound); },
    onPanResponderTerminate: () => { dragging.current = false; Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 3, useNativeDriver: true }).start(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [progress, scale]);
  const fillShift = progress.interpolate({ inputRange: [0, 1], outputRange: [-trackWidth / 2, 0] });
  const thumbLeft = progress.interpolate({ inputRange: [0, 1], outputRange: [0, trackWidth] });
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Txt variant="labelSmall" color={t.onSurfaceVariant}>{format ? format(min) : min}</Txt>
        <Txt variant="labelSmall" color={t.onSurfaceVariant}>{format ? format(max) : max}</Txt>
      </View>
      <View {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Pengatur nilai" onLayout={(e) => { const measured = e.nativeEvent.layout.width || 25; widthRef.current = Math.max(1, measured - 24); setWidth(measured); }} style={{ height: 44, justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, height: 8, borderRadius: 4, backgroundColor: t.surfaceHigh, overflow: 'hidden' }}>
          <Animated.View style={{ position: 'absolute', left: 0, width: trackWidth, height: 8, borderRadius: 4, backgroundColor: t.primary, transform: [{ translateX: fillShift }, { scaleX: progress }] }} />
        </View>
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 12, width: 24, height: 24, borderRadius: 12, backgroundColor: t.primary, borderWidth: 3, borderColor: t.surface, elevation: 3, shadowColor: t.primary, shadowOpacity: 0.24, shadowRadius: 5, transform: [{ translateX: thumbLeft }, { scale }] }} />
      </View>
    </View>
  );
}

/* ---------- sparkline ---------- */
export function Sparkline({ data, color, height = 72 }: { data: number[]; color: string; height?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { v.setValue(0); Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [data.length, v]);
  if (data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
      {data.map((d, i) => (
        <Animated.View key={i} style={{ flex: 1, height: 10 + ((d - lo) / span) * (height - 10), borderRadius: 3, backgroundColor: color, opacity: i === data.length - 1 ? 1 : 0.4, transform: [{ scaleY: v }] }} />
      ))}
    </View>
  );
}

/* ---------- app bar / nav ---------- */
/** Fades + nudges its content in whenever `id` changes. */
export function FadeSwap({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { v.setValue(0); Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [id, v]);
  return <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }, style]}>{children}</Animated.View>;
}
export function AppBar({ title, subtitle, top, actions, busy }: { title: string; subtitle?: string; top: number; actions?: ReactNode; busy?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, paddingTop: top }}>
      <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8 }}>
        <FadeSwap id={`${title}|${subtitle || ''}`} style={{ flex: 1 }}>
          <Txt variant="titleLarge" style={title === 'Hyperlink' ? { fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', fontWeight: '700', fontStyle: 'italic' } : undefined}>{title}</Txt>
          {subtitle ? <Txt variant="bodySmall" color={t.onSurfaceVariant}>{subtitle}</Txt> : null}
        </FadeSwap>
        {actions}
      </View>
      <LinearProgress active={Boolean(busy)} />
    </View>
  );
}

export const NAV_HEIGHT = 66;
export const NAV_MARGIN = 9;
/** Compact glass navigation capsule with a native adaptive backdrop blur and translucent fallback tint. */
export function NavBar<K extends string>({ items, active, onChange, bottom, badge }: { items: Array<{ id: K; label: string; icon: IconName }>; active: K; onChange: (id: K) => void; bottom: number; badge?: Partial<Record<K, number>> }) {
  const t = useTheme();
  const sound = useSoundConfig();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, items.findIndex((item) => item.id === active));
  const pad = 8;
  const cell = width > 0 ? (width - pad * 2) / items.length : 0;
  const slide = useRef(new Animated.Value(index)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: index, damping: 20, stiffness: 175, mass: 0.9, useNativeDriver: true }).start();
    stretch.setValue(1);
    Animated.spring(stretch, { toValue: 1.035, damping: 18, stiffness: 190, useNativeDriver: true }).start();
  }, [index, slide, stretch]);
  const glass = colorWithAlpha(t.surfaceContainer, t.dark ? 0.42 : 0.54);
  const edge = colorWithAlpha(t.outlineVariant, 0.72);
  const lens = colorWithAlpha(t.primaryContainer, t.dark ? 0.60 : 0.72);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: bottom + NAV_MARGIN, alignItems: 'center' }}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%', maxWidth: 540, height: NAV_HEIGHT, borderRadius: NAV_HEIGHT / 2, elevation: 9, shadowColor: '#000', shadowOpacity: t.dark ? 0.30 : 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 7 } }}>
        <View collapsable={false} style={{ flex: 1, borderRadius: NAV_HEIGHT / 2, backgroundColor: glass, borderWidth: 1, borderColor: edge, flexDirection: 'row', alignItems: 'center', paddingHorizontal: pad, overflow: 'hidden' }}>
          <BlurView pointerEvents="none" style={absoluteFill} blurType={t.dark ? 'dark' : 'light'} blurAmount={18} blurRadius={14} autoUpdate overlayColor="transparent" reducedTransparencyFallbackColor={t.dark ? '#10151F' : '#F8FAFC'} />
          <View pointerEvents="none" style={[absoluteFill, { backgroundColor: glass }]} />
          {cell > 0 ? <Animated.View pointerEvents="none" style={{ position: 'absolute', left: pad, top: 6, width: cell, height: NAV_HEIGHT - 12, borderRadius: (NAV_HEIGHT - 12) / 2, backgroundColor: lens, borderWidth: 1, borderColor: edge, transform: [{ translateX: slide.interpolate({ inputRange: items.map((_, i) => i), outputRange: items.map((_, i) => i * cell) }) }, { scaleX: stretch.interpolate({ inputRange: [1, 1.035], outputRange: [1, 1.015] }) }] }} /> : null}
          {items.map((item) => <NavItem key={item.id} item={item} selected={active === item.id} onPress={() => { playUiSound('select', sound); onChange(item.id); }} count={badge?.[item.id]} />)}
        </View>
      </View>
    </View>
  );
}

function NavItem({ item, selected, onPress, count }: { item: { label: string; icon: IconName }; selected: boolean; onPress: () => void; count?: number }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => { Animated.spring(v, { toValue: selected ? 1 : 0, speed: 18, bounciness: 8, useNativeDriver: true }).start(); }, [selected, v]);
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} style={{ flex: 1, minWidth: 0, height: NAV_HEIGHT - 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1 }}>
      <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ width: 26, height: 25, alignItems: 'center', justifyContent: 'center', transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
          <Icon name={item.icon} size={22} color={selected ? t.primary : t.onSurfaceVariant} />
          {count ? <View style={{ position: 'absolute', top: -3, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: t.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: t.onError, fontSize: 10, fontWeight: '700' }}>{count > 9 ? '9+' : count}</Text></View> : null}
        </Animated.View>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[type.labelSmall, { width: '100%', marginTop: 3, fontSize: 10, lineHeight: 13, includeFontPadding: false, textAlign: 'center', flexShrink: 1, color: selected ? t.primary : t.onSurfaceVariant, fontWeight: selected ? '700' : '500' }]}>{item.label}</Text>
      </View>
    </Pressable>
  );
}

/** Compact, full-width-safe trigger for grouped settings and filters. */
export function CompactSelector({ label, value, onPress, style }: { label: string; value: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <Press onPress={onPress} radius={16} style={[{ flex: 1, minWidth: 0 }, style]}>
    <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, backgroundColor: t.surfaceContainer }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1}>{label}</Txt>
        <Txt variant="titleSmall" color={t.primary} numberOfLines={1}>{value}</Txt>
      </View>
      <Icon name="chevron" size={17} color={t.onSurfaceVariant} />
    </View>
  </Press>;
}

export type PopupMenuItem = { id: string; label: string; subtitle?: string; icon: IconName; disabled?: boolean };

/** Animated, accessible option sheet for dense contextual choices and settings sections. */
export function PopupMenu({ visible, onClose, items, onSelect, title, subtitle, selectedId }: { visible: boolean; onClose: () => void; items: PopupMenuItem[]; onSelect: (id: string) => void; title: string; subtitle?: string; selectedId?: string }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      v.setValue(0);
      Animated.spring(v, { toValue: 1, damping: 22, stiffness: 220, mass: 0.85, useNativeDriver: true }).start();
      return undefined;
    }
    if (mounted) Animated.timing(v, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    return undefined;
  }, [visible, mounted, v]);
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[absoluteFill, { backgroundColor: t.scrim, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.52] }) }]}><Pressable onPress={onClose} style={{ flex: 1 }} /></Animated.View>
        <Animated.View style={{ maxHeight: '82%', backgroundColor: t.surfaceLow, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 28, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [38, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }] }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: t.outline, opacity: 0.55, marginBottom: 14 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: subtitle ? 4 : 10 }}>
            <Txt variant="titleLarge">{title}</Txt>
            <Press onPress={onClose} radius={20}><View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} /></View></Press>
          </View>
          {subtitle ? <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginBottom: 10 }}>{subtitle}</Txt> : null}
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {items.map((item) => {
              const selected = selectedId === item.id;
              return <Press key={item.id} disabled={item.disabled} onPress={() => onSelect(item.id)} radius={16}>
                <View style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: selected ? t.secondaryContainer : 'transparent' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: selected ? t.primaryContainer : t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}><Icon name={item.icon} size={20} color={selected ? t.onPrimaryContainer : t.onSurfaceVariant} /></View>
                  <View style={{ flex: 1 }}><Txt variant="titleSmall">{item.label}</Txt>{item.subtitle ? <Txt variant="bodySmall" color={t.onSurfaceVariant} numberOfLines={2}>{item.subtitle}</Txt> : null}</View>
                  {selected ? <Icon name="check" size={20} color={t.primary} /> : <Icon name="chevron" size={18} />}
                </View>
              </Press>;
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Scrollable bottom popup for controls that need sliders, switches or several related settings. */
export function PopupPanel({ visible, onClose, title, subtitle, children }: { visible: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      v.setValue(0);
      Animated.spring(v, { toValue: 1, damping: 22, stiffness: 220, mass: 0.85, useNativeDriver: true }).start();
      return undefined;
    }
    if (mounted) Animated.timing(v, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    return undefined;
  }, [visible, mounted, v]);
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);
  if (!mounted) return null;
  return <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View style={[absoluteFill, { backgroundColor: t.scrim, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.52] }) }]}><Pressable onPress={onClose} style={{ flex: 1 }} /></Animated.View>
      <Animated.View style={{ maxHeight: '88%', backgroundColor: t.surfaceLow, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 18, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [38, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }] }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: t.outline, opacity: 0.55, marginBottom: 14 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: subtitle ? 4 : 10 }}>
          <Txt variant="titleLarge">{title}</Txt>
          <Press onPress={onClose} radius={20}><View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} /></View></Press>
        </View>
        {subtitle ? <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginBottom: 10 }}>{subtitle}</Txt> : null}
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}

/* ---------- snackbar ---------- */
export function Snackbar({ message, tone, bottom, onDismiss, icon }: { message: string; tone: 'info' | 'error' | 'success' | 'warning'; bottom: number; onDismiss: () => void; icon?: IconName }) {
  const t = useTheme();
  const sound = useSoundConfig();
  const v = useRef(new Animated.Value(0)).current;
  const [text, setText] = useState(message);
  useEffect(() => {
    if (!message) { Animated.timing(v, { toValue: 0, duration: 160, useNativeDriver: true }).start(); return undefined; }
    setText(message);
    Animated.spring(v, { toValue: 1, speed: 16, bounciness: 6, useNativeDriver: true }).start();
    const id = setTimeout(onDismiss, tone === 'error' || tone === 'warning' ? 5500 : 3200);
    return () => clearTimeout(id);
  }, [message, tone, onDismiss, v]);
  useEffect(() => {
    if (message) playUiSound(tone === 'error' || tone === 'warning' ? 'error' : tone === 'success' ? 'confirm' : 'notify', sound);
  }, [message, tone, sound]);
  const bg = tone === 'error' ? t.errorContainer : tone === 'warning' ? t.warningContainer : tone === 'success' ? t.successContainer : t.surfaceHigh;
  const fg = tone === 'error' ? t.onErrorContainer : tone === 'warning' ? t.onWarningContainer : tone === 'success' ? t.onSuccessContainer : t.onSurface;
  const statusIcon: IconName = icon || (tone === 'error' || tone === 'warning' ? 'warning' : tone === 'success' ? 'check' : 'info');
  const cut = text.indexOf(' · ');
  const title = cut > 0 ? text.slice(0, cut) : text;
  const detail = cut > 0 ? text.slice(cut + 3) : '';
  return (
    <Animated.View pointerEvents={message ? 'auto' : 'none'} style={{ position: 'absolute', alignSelf: 'center', maxWidth: '92%', bottom, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
      <Pressable onPress={onDismiss} style={{ minHeight: 48, borderRadius: 24, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 18, paddingVertical: 7, elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: fg + '1F', alignItems: 'center', justifyContent: 'center' }}><Icon name={statusIcon} size={17} color={fg} /></View>
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[type.label, { color: fg, fontWeight: '700' }]}>{title}</Text>
          {detail ? <Text numberOfLines={1} ellipsizeMode="tail" style={[type.labelSmall, { color: fg, opacity: 0.75 }]}>{detail}</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- bottom sheet ---------- */
export function BottomSheet({ visible, onClose, children, bottom, height }: { visible: boolean; onClose: () => void; children: ReactNode; bottom: number; height?: ViewStyle['height'] }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const drag = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const sheetPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => { if (g.dy > 0) drag.setValue(g.dy); },
    onPanResponderRelease: (_e, g) => { if (g.dy > 110 || g.vy > 0.9) closeRef.current(); else Animated.spring(drag, { toValue: 0, damping: 20, stiffness: 220, useNativeDriver: true }).start(); },
    onPanResponderTerminate: () => { Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(); },
  }), [drag]);
  useEffect(() => {
    if (visible) { setMounted(true); drag.setValue(0); Animated.spring(v, { toValue: 1, damping: 22, stiffness: 210, mass: 0.9, useNativeDriver: true }).start(); return undefined; }
    Animated.timing(v, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    return undefined;
  }, [visible, v, drag]);
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={{ ...absoluteFill, backgroundColor: t.scrim, opacity: Animated.multiply(v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }), drag.interpolate({ inputRange: [0, 300], outputRange: [1, 0.2], extrapolate: 'clamp' })) }}><Pressable style={{ flex: 1 }} onPress={onClose} /></Animated.View>
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', height, overflow: height ? 'hidden' : undefined, backgroundColor: t.surfaceLow, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 20, paddingBottom: bottom + 16, transform: [{ translateY: Animated.add(v.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }), drag) }] }}>
        <View {...sheetPan.panHandlers} style={{ alignSelf: 'stretch', alignItems: 'center', paddingVertical: 8, marginTop: -8, marginBottom: 4 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.outline, opacity: 0.55 }} /></View>
        {children}
      </Animated.View>
    </Modal>
  );
}
const absoluteFill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTheme();
  return <View style={{ flex: 1, minWidth: 0 }}><Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1}>{label}</Txt><Txt variant="titleMedium" color={color} numberOfLines={1}>{value}</Txt></View>;
}

export type { Theme };

/** Pulsing placeholder block shown while data loads. */
export function Skeleton({ width, height = 14, radius = 7, style }: { width?: number | string; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.45, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ width: width as number, height, borderRadius: radius, backgroundColor: t.surfaceHigh, opacity: v }, style]} />;
}
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return <View>{Array.from({ length: count }).map((_, i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
    <Skeleton width={44} height={44} radius={22} />
    <View style={{ flex: 1, gap: 7 }}><Skeleton width="45%" height={13} /><Skeleton width="70%" height={10} /></View>
    <View style={{ alignItems: 'flex-end', gap: 7 }}><Skeleton width={64} height={13} /><Skeleton width={44} height={10} /></View>
  </View>)}</View>;
}
