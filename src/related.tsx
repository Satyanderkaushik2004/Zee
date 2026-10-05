import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { T } from './ui';
import { C, S } from './theme';
import { Item } from './db';
import { dismiss, link, relatedFor } from './graph';

const Row = ({ it, actions, onOpen }: { it: Item; actions: [string, () => void][]; onOpen: () => void }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.card, borderRadius: 12, padding: S.sm }}>
    <Pressable style={{ flex: 1 }} onPress={onOpen}><T style={{ fontWeight: '600' }}>{it.title}</T><T muted>{it.type}</T></Pressable>
    {actions.map(([l, f]) => <Pressable key={l} onPress={f} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: C.raised }}><T style={{ fontSize: 13 }}>{l}</T></Pressable>)}
  </View>
);

export function RelatedPanel({ itemId, onChange }: { itemId: number; onChange?: () => void }) {
  const r = useRouter();
  const [d, setD] = useState<{ linked: Item[]; suggested: Item[] } | null>(null);
  const load = useCallback(async () => setD(await relatedFor(itemId)), [itemId]);
  useEffect(() => { load(); }, [load]);
  const act = (f: () => Promise<void>) => async () => { await f(); await load(); onChange?.(); };
  if (!d) return null;
  return (
    <View style={{ gap: S.sm }}>
      <T muted>Related items</T>
      {d.linked.map((x) => <Row key={x.id} it={x} onOpen={() => r.push('/item/' + x.id)} actions={[['Unlink', act(() => dismiss(itemId, x.id))]]} />)}
      {d.suggested.length > 0 && <T muted style={{ color: C.orange }}>Suggested by Zee, computed on this phone</T>}
      {d.suggested.map((x) => <Row key={x.id} it={x} onOpen={() => r.push('/item/' + x.id)} actions={[['Link', act(() => link(itemId, x.id))], ['Dismiss', act(() => dismiss(itemId, x.id))]]} />)}
      {!d.linked.length && !d.suggested.length && <T muted>Nothing related yet. Suggestions appear as you save more items.</T>}
    </View>
  );
}
