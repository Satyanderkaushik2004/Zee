import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Input, Btn, Chip, T, Empty } from '../../src/ui';
import { C, S } from '../../src/theme';
import { Reminder, listReminders, setReminderDone } from '../../src/db';
import { QUICK, addReminder, cancelReminder, notificationsAllowed, parseWhen } from '../../src/reminders';

export default function Reminders() {
  const r = useRouter();
  const [list, setList] = useState<Reminder[]>([]);
  const [title, setTitle] = useState(''); const [custom, setCustom] = useState('');
  const [quick, setQuick] = useState(1);
  const [notif, setNotif] = useState(true);
  const load = useCallback(async () => { setList(await listReminders()); setNotif(await notificationsAllowed(false)); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!title.trim()) return Alert.alert('Add a title', 'What should Zee remind you about?');
    const when = custom.trim() ? parseWhen(custom) : QUICK[quick][1]();
    if (when == null) return Alert.alert('Check the date', 'Use the format 2026-11-05 18:30.');
    if (when <= Date.now()) return Alert.alert('That time has passed', 'Pick a later time.');
    await addReminder(title.trim(), when, null); setTitle(''); setCustom(''); load();
  };
  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: S.lg, paddingBottom: 60 }}
        data={list}
        keyExtractor={(x) => String(x.id)}
        ListHeaderComponent={
          <View style={{ gap: S.sm, marginBottom: S.lg }}>
            {!notif && <T style={{ color: C.orange }}>Notifications are off. Reminders will only show inside Zee until you allow them in Android settings.</T>}
            <Input placeholder="Remind me to…" value={title} onChangeText={setTitle} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>{QUICK.map(([l], i) => <Chip key={l} label={l} on={!custom.trim() && quick === i} onPress={() => { setQuick(i); setCustom(''); }} />)}</View>
            <Input placeholder="Or exact time: 2026-11-05 18:30" value={custom} onChangeText={setCustom} autoCapitalize="none" />
            <Btn label="Add reminder" onPress={add} />
          </View>
        }
        renderItem={({ item }) => {
          const late = !item.done && item.due < Date.now();
          return (
            <Pressable onPress={() => item.item_id && r.push('/item/' + item.item_id)}
              onLongPress={() => Alert.alert(item.title, 'Delete this reminder?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await cancelReminder(item.id, true); load(); } }])}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 10, opacity: item.done ? 0.5 : 1, borderLeftWidth: 3, borderLeftColor: late ? C.orange : C.border }}>
              <Pressable hitSlop={10} onPress={async () => { if (!item.done) await cancelReminder(item.id, false); await setReminderDone(item.id, !item.done); load(); }}>
                <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={item.done ? C.ok : C.muted} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600', textDecorationLine: item.done ? 'line-through' : 'none' }}>{item.title}</T>
                <T muted style={late ? { color: C.orange } : undefined}>{late ? 'Overdue · ' : ''}{new Date(item.due).toLocaleString()}</T>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Empty title="No reminders" hint="Add one above, or open any saved item and tap a time. Long-press a reminder to delete it." />}
      />
    </Screen>
  );
}
