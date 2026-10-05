import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Input, Btn, Chip, T } from '../src/ui';
import { S } from '../src/theme';
import { CYCLES, SUB_STATUS, deleteSub, listSubs, parseDate, saveSub, toInput } from '../src/track';

export default function SubscriptionForm() {
  const p = useLocalSearchParams<{ id?: string }>();
  const r = useRouter();
  const id = p.id ? Number(p.id) : undefined;
  const [name, setName] = useState(''); const [price, setPrice] = useState(''); const [currency, setCurrency] = useState('INR');
  const [cycle, setCycle] = useState('monthly'); const [next, setNext] = useState(''); const [status, setStatus] = useState('active');
  const [url, setUrl] = useState(''); const [category, setCategory] = useState(''); const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!id) return;
    listSubs().then((all) => { const s = all.find((x) => x.id === id); if (!s) return;
      setName(s.name); setPrice(String(s.price)); setCurrency(s.currency); setCycle(s.cycle); setNext(toInput(s.next_date)); setStatus(s.status); setUrl(s.url); setCategory(s.category); setNotes(s.notes); });
  }, [id]);
  const save = async () => {
    const amount = parseFloat(price.replace(',', '.'));
    const nd = parseDate(next, false);
    if (!name.trim()) return Alert.alert('Add a name', 'Which service is this?');
    if (isNaN(amount) || amount < 0) return Alert.alert('Check the price', 'Enter the amount you pay each cycle, like 199.');
    if (nd == null) return Alert.alert('Check the date', 'Enter the next renewal date as 2026-11-05.');
    if (!id && (await listSubs()).some((s) => s.name.toLowerCase() === name.trim().toLowerCase() && s.status !== 'cancelled'))
      return Alert.alert('Already tracked', `You already track ${name.trim()}. Edit that one instead.`);
    await saveSub({ id, name: name.trim(), price: amount, currency: currency.trim().toUpperCase() || 'INR', cycle, next_date: nd, status, url: url.trim(), category: category.trim(), notes });
    r.back();
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Input placeholder="Service name" value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <Input style={{ width: 90 }} placeholder="INR" value={currency} onChangeText={setCurrency} autoCapitalize="characters" />
          <Input style={{ flex: 1 }} placeholder="Price per cycle" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{CYCLES.map((k) => <Chip key={k} label={k} on={cycle === k} onPress={() => setCycle(k)} />)}</ScrollView>
        <Input placeholder="Next renewal: 2026-11-05" value={next} onChangeText={setNext} autoCapitalize="none" />
        <T muted>Status</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{SUB_STATUS.map((k) => <Chip key={k} label={k} on={status === k} onPress={() => setStatus(k)} />)}</ScrollView>
        <Input placeholder="Category (optional)" value={category} onChangeText={setCategory} />
        <Input placeholder="Manage or cancel link (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" />
        <Input placeholder="Notes" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
        <T muted>Marking a subscription cancelled only updates Zee. Cancel with the service itself.</T>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          {id ? <View style={{ flex: 1 }}><Btn label="Delete" kind="danger" onPress={() => Alert.alert('Delete this subscription?', "This can't be undone.", [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSub(id); r.back(); } }])} /></View> : null}
          <View style={{ flex: 2 }}><Btn label="Save" onPress={save} /></View>
        </View>
      </ScrollView>
    </Screen>
  );
}
