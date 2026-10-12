import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { C } from './theme';

export function Button({ title, onPress, variant = 'solid', disabled, loading, style }: { title: string; onPress: () => void; variant?: 'solid' | 'outline' | 'danger'; disabled?: boolean; loading?: boolean; style?: ViewStyle }) {
  const solid = variant === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        solid ? { backgroundColor: C.accent } : { borderWidth: 1, borderColor: variant === 'danger' ? C.danger : C.ink, backgroundColor: C.surface },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={solid ? '#fff' : C.ink} /> : <Text style={[s.btnText, { color: solid ? '#fff' : variant === 'danger' ? C.danger : C.ink }]}>{title}</Text>}
    </Pressable>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => <View style={[s.card, style]}>{children}</View>;

const TONES = { info: [C.infoBg, C.info], warning: [C.warningBg, C.warning], danger: [C.dangerBg, C.danger], success: [C.successBg, C.success] } as const;
export function Banner({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={[s.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Text style={{ color: fg, fontSize: 15 }}>{children}</Text>
    </View>
  );
}

const STATUS: Record<string, [string, string, string]> = {
  ASSIGNED: ['Assigned', C.infoBg, C.info],
  PICKED_UP: ['Picked up', C.infoBg, C.info],
  OUT_FOR_DELIVERY: ['Out for delivery', C.warningBg, C.warning],
  DELIVERED: ['Delivered', C.successBg, C.success],
  FAILED: ['Failed', C.dangerBg, C.danger],
  RETURNED: ['Returned', C.dangerBg, C.danger],
};
export function StatusBadge({ status }: { status: string }) {
  const [label, bg, fg] = STATUS[status] ?? [status.replace(/_/g, ' ').toLowerCase(), C.muted, C.sub];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Field({ label, hint, ...p }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#9AA0A6" {...p} style={[s.input, p.style]} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => <Text style={s.h1}>{children}</Text>;
export const Muted = ({ children }: { children: ReactNode }) => <Text style={{ color: C.sub, fontSize: 14 }}>{children}</Text>;

export const s = StyleSheet.create({
  btn: { minHeight: 52, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 2 },
  btnText: { fontSize: 16, fontWeight: '600' },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 },
  banner: { padding: 12, marginBottom: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, alignSelf: 'flex-start' },
  label: { fontSize: 14, fontWeight: '600', color: C.ink },
  hint: { fontSize: 12, color: C.sub },
  input: { minHeight: 52, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 12, fontSize: 17, color: C.ink },
  h1: { fontFamily: 'serif', fontSize: 28, color: C.ink },
});
