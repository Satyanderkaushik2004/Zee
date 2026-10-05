import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, Input, Btn, T, Empty } from '../../src/ui';
import { C, S } from '../../src/theme';
import { Col, addCol, listCols, removeCol } from '../../src/db';

const COLORS = ['#7C6CF0', '#FF8A3D', '#4F46C8', '#4FD08A', '#E0568B', '#3FA7D6'];

export default function Collections() {
  const r = useRouter();
  const [cols, setCols] = useState<Col[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const load = useCallback(async () => setCols(await listCols()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const add = async () => { if (!name.trim()) return; await addCol(name.trim(), color); setName(''); load(); };
  return (
    <Screen>
      <View style={{ padding: S.lg, gap: S.sm }}>
        <Input placeholder="New collection name" value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'center' }}>
          {COLORS.map((c) => <Pressable key={c} onPress={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: '#fff' }} />)}
          <View style={{ flex: 1 }} /><Btn label="Create" onPress={add} />
        </View>
      </View>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: S.lg }}
        data={cols}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => (
          <Pressable onPress={() => r.navigate({ pathname: '/library', params: { c: String(item.id) } })}
            onLongPress={() => Alert.alert(item.name, 'Delete this collection? Its items stay in your library.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => { await removeCol(item.id); load(); } }])}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: item.color }}>
            <T style={{ flex: 1, fontWeight: '600', fontSize: 16 }}>{item.name}</T>
            <T muted>{item.n} items</T>
          </Pressable>
        )}
        ListEmptyComponent={<Empty title="No collections yet" hint="Create one above, then pick it when you save something. Tap to browse it, long-press to delete." />}
      />
    </Screen>
  );
}
