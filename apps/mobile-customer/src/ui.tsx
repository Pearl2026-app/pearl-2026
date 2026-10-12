import type { ReactNode } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { img } from './api';
import { inr } from './format';
import { C } from './theme';
import type { ProductCard } from './types';

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
  PLACED: ['Placed', C.infoBg, C.info],
  CONFIRMED: ['Confirmed', C.infoBg, C.info],
  PACKED: ['Packed', C.infoBg, C.info],
  ASSIGNED: ['With our delivery partner', C.infoBg, C.info],
  PICKED_UP: ['On the way', C.warningBg, C.warning],
  OUT_FOR_DELIVERY: ['Out for delivery', C.warningBg, C.warning],
  DELIVERED: ['Delivered', C.successBg, C.success],
  CANCELLED: ['Cancelled', C.dangerBg, C.danger],
  FAILED: ['Payment not completed', C.dangerBg, C.danger],
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

export function Price({ p, size = 15 }: { p: Pick<ProductCard, 'pricePaise' | 'compareAtPaise' | 'priceOnRequest'>; size?: number }) {
  if (p.priceOnRequest || p.pricePaise == null) return <Text style={{ fontSize: size, color: C.sub, fontStyle: 'italic' }}>Price on request</Text>;
  return (
    <Text style={{ fontSize: size, color: C.ink }}>
      {inr(p.pricePaise)}
      {p.compareAtPaise && p.compareAtPaise > p.pricePaise ? <Text style={{ color: C.sub, textDecorationLine: 'line-through', fontSize: size - 3 }}>  {inr(p.compareAtPaise)}</Text> : null}
    </Text>
  );
}

export const imageOf = (p: { images: Array<{ url: string; variants?: Record<string, string> | null }> }, width = '800') => img(p.images[0]?.variants?.[width] ?? p.images[0]?.url);

/** Two-column grid tile. */
export function ProductTile({ p }: { p: ProductCard }) {
  const uri = imageOf(p, '400');
  return (
    <Link href={`/product/${p.slug}`} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={p.name} style={{ flex: 1, margin: 6 }}>
        <View style={{ aspectRatio: 1, backgroundColor: C.muted }}>
          {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
          {p.isSold ? <Text style={s.tag}>SOLD</Text> : p.isUnique ? <Text style={[s.tag, { backgroundColor: C.surface, color: C.ink }]}>ONE OF A KIND</Text> : null}
        </View>
        <Text style={{ fontFamily: 'serif', fontSize: 16, color: C.ink, marginTop: 6 }} numberOfLines={1}>{p.name}</Text>
        <Text style={{ fontSize: 12, color: C.sub }} numberOfLines={1}>{[p.farm?.name, p.caratWeight != null ? `${p.caratWeight} ct` : null, p.shape].filter(Boolean).join(' · ')}</Text>
        <Price p={p} size={14} />
      </Pressable>
    </Link>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={{ paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accent : C.surface, marginRight: 8, marginBottom: 8 }}>
      <Text style={{ color: on ? '#fff' : C.ink, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export const Eyebrow = ({ children }: { children: ReactNode }) => <Text style={{ fontSize: 11, letterSpacing: 1.6, color: C.sub, textTransform: 'uppercase' }}>{children}</Text>;

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
  tag: { position: 'absolute', top: 8, left: 8, backgroundColor: C.ink, color: '#fff', fontSize: 10, letterSpacing: 1.2, paddingHorizontal: 6, paddingVertical: 3 },
});
