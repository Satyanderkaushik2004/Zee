import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, TextInput, StyleSheet, TextInputProps, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, S } from './theme';
import { Item, source } from './db';
import { isOnline } from './net';

export function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let live = true;
    const t = async () => { const v = await isOnline(); if (live) setOn(v); };
    t(); const id = setInterval(t, 8000);
    return () => { live = false; clearInterval(id); };
  }, []);
  return on;
}
export const Screen = ({ children }: { children: React.ReactNode }) => {
  const on = useOnline();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {!on && <View style={{ backgroundColor: '#2A1E10', paddingVertical: 6, paddingHorizontal: 14 }}>
        <Text style={{ color: C.orange, fontSize: 12 }}>Offline. Saving, search and reminders still work. AI and link previews catch up when you reconnect.</Text>
      </View>}
      {children}
    </View>
  );
};
export const H = ({ children }: { children: React.ReactNode }) => <Text style={{ color: C.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.4 }}>{children}</Text>;
export const T = ({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) =>
  <Text style={[{ color: muted ? C.muted : C.text, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>;

export const Input = (p: TextInputProps) =>
  <TextInput placeholderTextColor={C.muted} {...p} style={[st.input, p.style]} />;

export const Btn = ({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [st.btn, kind === 'primary' && { backgroundColor: C.violet }, kind === 'ghost' && { backgroundColor: C.raised }, kind === 'danger' && { backgroundColor: '#3A1D24' }, (pressed || disabled) && { opacity: 0.6 }]}>
    <Text style={{ color: kind === 'danger' ? C.danger : C.text, fontWeight: '600' }}>{label}</Text>
  </Pressable>
);

export const Chip = ({ label, on, onPress, color }: { label: string; on?: boolean; onPress: () => void; color?: string }) => (
  <Pressable onPress={onPress} style={[st.chip, on && { backgroundColor: color ?? C.violet, borderColor: color ?? C.violet }]}>
    <Text style={{ color: on ? '#fff' : C.muted, fontSize: 13 }}>{label}</Text>
  </Pressable>
);

export const Empty = ({ title, hint }: { title: string; hint: string }) => (
  <View style={{ padding: S.xl * 2, alignItems: 'center', gap: 6 }}>
    <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    <Text style={{ color: C.muted, textAlign: 'center' }}>{hint}</Text>
  </View>
);

export const fmtDur = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
export const fmtSize = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const ICON: Record<string, any> = { link: 'link', voice: 'mic', image: 'image', file: 'document-attach', note: 'document-text', snippet: 'code-slash', command: 'terminal', prompt: 'sparkles', idea: 'bulb' };
export const ItemCard = ({ it, onFav, onLongPress, onPress, hint }: { it: Item; onFav?: () => void; onLongPress?: () => void; onPress?: () => void; hint?: string }) => (
  <Pressable onPress={onPress} onLongPress={onLongPress} style={st.card}>
    <View style={st.icon}>{it.type === 'image' && it.file_uri ? <Image source={{ uri: it.file_uri }} style={{ width: 36, height: 36, borderRadius: 10 }} /> : <Ionicons name={ICON[it.type] ?? 'document'} size={18} color={C.violet} />}</View>
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={{ color: C.text, fontWeight: '600' }}>{it.title}</Text>
      <Text numberOfLines={2} style={{ color: C.muted, marginTop: 2 }}>{hint ?? (it.type === 'voice' ? fmtDur(it.dur) + ' · ' + (it.body ? it.body.slice(0, 80) : 'Not transcribed yet') : it.file_uri ? (it.mime || it.type) + ' · ' + fmtSize(it.size) : it.url ? source(it.url) + (it.body ? ' · ' + it.body : '') : it.body)}</Text>
    </View>
    {onFav && <Pressable hitSlop={10} onPress={onFav}><Ionicons name={it.fav ? 'star' : 'star-outline'} size={20} color={it.fav ? C.orange : C.muted} /></Pressable>}
  </Pressable>
);

const st = StyleSheet.create({
  input: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12, color: C.text, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: C.card },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' },
});
