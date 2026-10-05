import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Input, Btn, Chip, T } from '../src/ui';
import { S } from '../src/theme';
import { KINDS, OPP_STATUS, deleteOpp, listOpps, parseDate, saveOpp, toInput } from '../src/track';

export default function OpportunityForm() {
  const p = useLocalSearchParams<{ id?: string; title?: string; url?: string }>();
  const r = useRouter();
  const [title, setTitle] = useState(p.title ?? ''); const [org, setOrg] = useState(''); const [kind, setKind] = useState('Other');
  const [url, setUrl] = useState(p.url ?? ''); const [deadline, setDeadline] = useState(''); const [status, setStatus] = useState('Interested');
  const [notes, setNotes] = useState(''); const [remind, setRemind] = useState(true);
  const id = p.id ? Number(p.id) : undefined;
  useEffect(() => {
    if (!id) return;
    listOpps().then((all) => { const o = all.find((x) => x.id === id); if (!o) return;
      setTitle(o.title); setOrg(o.org); setKind(o.kind); setUrl(o.url); setDeadline(toInput(o.deadline)); setStatus(o.status); setNotes(o.notes); setRemind(!!o.remind); });
  }, [id]);
  const save = async () => {
    if (!title.trim()) return Alert.alert('Add a title', 'What is this opportunity called?');
    const dl = deadline.trim() ? parseDate(deadline) : null;
    if (deadline.trim() && dl == null) return Alert.alert('Check the date', 'Use the format 2026-11-30, or leave it empty.');
    await saveOpp({ id, title: title.trim(), org: org.trim(), kind, url: url.trim(), deadline: dl, status, notes, remind: remind ? 1 : 0 });
    r.back();
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Input placeholder="Title" value={title} onChangeText={setTitle} />
        <Input placeholder="Organization" value={org} onChangeText={setOrg} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{KINDS.map((k) => <Chip key={k} label={k} on={kind === k} onPress={() => setKind(k)} />)}</ScrollView>
        <Input placeholder="Link" value={url} onChangeText={setUrl} autoCapitalize="none" />
        <Input placeholder="Deadline: 2026-11-30 (optional)" value={deadline} onChangeText={setDeadline} autoCapitalize="none" />
        <T muted>Status</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{OPP_STATUS.map((k) => <Chip key={k} label={k} on={status === k} onPress={() => setStatus(k)} />)}</ScrollView>
        <Input placeholder="Eligibility, skills, notes" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
        <View style={{ flexDirection: 'row' }}><Chip label={remind ? 'Reminder 1 day before: on' : 'Reminder 1 day before: off'} on={remind} onPress={() => setRemind(!remind)} /></View>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          {id ? <View style={{ flex: 1 }}><Btn label="Delete" kind="danger" onPress={() => Alert.alert('Delete this opportunity?', "This can't be undone.", [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteOpp(id); r.back(); } }])} /></View> : null}
          <View style={{ flex: 2 }}><Btn label="Save" onPress={save} /></View>
        </View>
      </ScrollView>
    </Screen>
  );
}
