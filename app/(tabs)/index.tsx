import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, H, T, ItemCard, Empty } from '../../src/ui';
import { C, S } from '../../src/theme';
import { Item, Reminder, getSetting, jobStats, listItems, listReminders, stats, toggleFav } from '../../src/db';

export default function Home() {
  const r = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [rem, setRem] = useState<Reminder[]>([]);
  const [wait, setWait] = useState(0);
  const [hide, setHide] = useState<string[]>([]);
  const [s, setS] = useState({ items: 0, inbox: 0, cols: 0 });
  const load = useCallback(async () => {
    setItems(await listItems({ limit: 8 })); setS(await stats());
    setRem((await listReminders()).filter((x) => !x.done).slice(0, 3));
    setWait((await jobStats()).waiting);
    setHide(JSON.parse((await getSetting('homeHidden')) ?? '[]'));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: S.lg, paddingBottom: 100 }}
        data={hide.includes('recent') ? [] : items}
        keyExtractor={(i) => String(i.id)}
        ListHeaderComponent={
          <View style={{ gap: S.lg, marginBottom: S.lg }}>
            <H>Everything you save, in one place.</H>
            {!hide.includes('stats') && <View style={{ flexDirection: 'row', gap: S.sm }}>
              {[['Saved', s.items, C.violet], ['In inbox', s.inbox, C.orange], ['Collections', s.cols, C.indigo]].map(([l, n, c]) => (
                <View key={l as string} style={{ flex: 1, backgroundColor: C.card, borderRadius: 14, padding: S.md, borderLeftWidth: 3, borderLeftColor: c as string }}>
                  <T style={{ fontSize: 24, fontWeight: '700' }}>{n as number}</T><T muted>{l as string}</T>
                </View>
              ))}
            </View>}
            {wait > 0 && !hide.includes('queue') && <T muted>{wait} item{wait > 1 ? 's' : ''} waiting for link previews or smart-search indexing. They run automatically when you're online.</T>}
            {rem.length > 0 && !hide.includes('soon') && (
              <View style={{ gap: S.sm }}>
                <T muted>Coming up</T>
                {rem.map((x) => (
                  <Pressable key={x.id} onPress={() => (x.item_id ? r.push('/item/' + x.item_id) : r.navigate('/reminders'))} style={{ backgroundColor: C.card, borderRadius: 12, padding: S.md, borderLeftWidth: 3, borderLeftColor: x.due < Date.now() ? C.orange : C.violet }}>
                    <T style={{ fontWeight: '600' }}>{x.title}</T><T muted>{new Date(x.due).toLocaleString()}</T>
                  </Pressable>
                ))}
              </View>
            )}
            {!hide.includes('recent') && <T muted>Recently saved</T>}
          </View>
        }
        renderItem={({ item }) => <ItemCard it={item} onPress={() => r.push('/item/' + item.id)} onFav={async () => { await toggleFav(item.id); load(); }} />}
        ListEmptyComponent={hide.includes('recent') ? null : <Empty title="Nothing saved yet" hint="Tap + to save a link, note, snippet, command, prompt or idea. It lands in your inbox." />}
      />
      <Pressable onPress={() => r.push('/capture')} style={{ position: 'absolute', right: S.lg, bottom: S.lg, width: 60, height: 60, borderRadius: 30, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center', elevation: 6 }}>
        <Ionicons name="add" size={32} color="#1A1008" />
      </Pressable>
    </Screen>
  );
}
