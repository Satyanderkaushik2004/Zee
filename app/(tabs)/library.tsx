import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Input, Chip, ItemCard, Empty } from '../../src/ui';
import { S } from '../../src/theme';
import { Item, listItems, removeItem, search, toggleFav } from '../../src/db';
import { hybrid } from '../../src/search';

const excerpt = (it: Item, q: string) => {
  if (!it.ocr) return undefined;
  const low = it.ocr.toLowerCase();
  for (const t of q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const i = low.indexOf(t);
    if (i >= 0) return '…' + it.ocr.slice(Math.max(0, i - 30), i + 70).replace(/\s+/g, ' ') + '…';
  }
  return undefined;
};
const TYPES = ['link', 'voice', 'image', 'file', 'note', 'snippet', 'command', 'prompt', 'idea'];

export default function Library() {
  const r = useRouter();
  const { c } = useLocalSearchParams<{ c?: string }>();
  const [smart, setSmart] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [col, setCol] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => { setCol(c ? Number(c) : null); }, [c]);

  const load = useCallback(async () => {
    if (q.trim()) {
      let res = smart && q.trim().length > 2 ? (await hybrid(q, 30)).items : await search(q);
      if (type) res = res.filter((i) => i.type === type);
      if (fav) res = res.filter((i) => i.fav);
      if (col != null) res = res.filter((i) => i.col === col);
      setItems(res);
    } else setItems(await listItems({ type, fav, col }));
  }, [q, type, fav, col, smart]);
  useFocusEffect(useCallback(() => { const t = setTimeout(load, smart ? 600 : 0); return () => clearTimeout(t); }, [load, smart]));

  return (
    <Screen>
      <View style={{ padding: S.lg, gap: S.sm }}>
        <Input placeholder="Search your library" value={q} onChangeText={setQ} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label="ThoughtMap ›" onPress={() => r.navigate('/map')} />
          <Chip label="Collections ›" onPress={() => r.navigate('/collections')} />
          <Chip label="Smart search" on={smart} onPress={() => setSmart(!smart)} />
          <Chip label="Favorites" on={fav} onPress={() => setFav(!fav)} />
          {col != null && <Chip label="Collection filter ✕" on onPress={() => setCol(null)} />}
          {TYPES.map((x) => <Chip key={x} label={x} on={type === x} onPress={() => setType(type === x ? null : x)} />)}
        </ScrollView>
      </View>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 40 }}
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => (
          <ItemCard it={item} hint={q.trim() ? excerpt(item, q) : undefined} onPress={() => r.push('/item/' + item.id)}
            onFav={async () => { await toggleFav(item.id); load(); }}
            onLongPress={() => Alert.alert(item.title, 'Delete this item?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => { await removeItem(item.id); load(); } }])} />
        )}
        ListEmptyComponent={<Empty title={q ? 'No matches' : 'Your library is empty'} hint={q ? 'Try fewer or different words.' : 'Saved items show up here. Long-press an item to delete it.'} />}
      />
    </Screen>
  );
}
