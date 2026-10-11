import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { playUiSound, useSoundConfig } from './sounds';
import { useTheme } from './theme';
import { Txt } from './ui';

export type SegOption<K extends string> = { id: K; label: string; color?: string; textColor?: string; disabled?: boolean };

/** Exchange-style segmented control with a sliding highlight (colour follows the selected option). */
export function Segmented<K extends string>({ options, value, onChange, height = 42 }: { options: Array<SegOption<K>>; value: K; onChange: (id: K) => void; height?: number }) {
  const t = useTheme();
  const sound = useSoundConfig();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const pos = useRef(new Animated.Value(index)).current;
  const pad = 3;
  const cell = width > 0 ? (width - pad * 2) / options.length : 0;
  useEffect(() => { Animated.spring(pos, { toValue: index, damping: 17, stiffness: 220, mass: 0.8, useNativeDriver: true }).start(); }, [index, pos]);
  const active = options[index];
  return <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height, borderRadius: height / 2, backgroundColor: t.surfaceHigh, flexDirection: 'row', padding: pad }}>
    {cell > 0 ? <Animated.View pointerEvents="none" style={{ position: 'absolute', left: pad, top: pad, width: cell, height: height - pad * 2, borderRadius: (height - pad * 2) / 2, backgroundColor: active?.color || t.primary, transform: [{ translateX: pos.interpolate({ inputRange: options.map((_, i) => i), outputRange: options.map((_, i) => i * cell) }) }] }} /> : null}
    {options.map((o) => {
      const on = o.id === value;
      return <Pressable key={o.id} disabled={o.disabled} onPress={() => { if (!on) { playUiSound('select', sound); onChange(o.id); } }} accessibilityRole="button" accessibilityState={{ selected: on, disabled: o.disabled }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: o.disabled ? 0.4 : 1 }}>
        <Txt variant="label" color={on ? (o.textColor || t.onPrimary) : t.onSurfaceVariant} numberOfLines={1}>{o.label}</Txt>
      </Pressable>;
    })}
  </View>;
}
