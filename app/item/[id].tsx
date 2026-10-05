import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Screen, Input, Btn, Chip, T, fmtSize, fmtDur } from '../../src/ui';
import { C, S } from '../../src/theme';
import { Col, Item, dropFile, getItem, getJob, listCols, removeItem, updateItem } from '../../src/db';
import { QUICK, addReminder } from '../../src/reminders';
import { kick, requestAi } from '../../src/jobs';
import { activeProvider } from '../../src/ai';
import { RelatedPanel } from '../../src/related';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRouter();
  const [it, setIt] = useState<Item | null>(null);
  const [cols, setCols] = useState<Col[]>([]);
  const [ocr, setOcr] = useState('');
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [note, setNote] = useState('');
  const [col, setCol] = useState<number | null>(null);
  const [job, setJob] = useState<{ kind: string; status: string; error: string } | null>(null);
  const was = useRef(false);
  const player = useAudioPlayer(it?.type === 'voice' && it.file_uri ? it.file_uri : null);
  const ps = useAudioPlayerStatus(player);

  const fill = (x: Item) => { setIt(x); setTitle(x.title); setBody(x.body); setNote(x.note); setCol(x.col); setOcr(x.ocr); };
  useEffect(() => {
    const n = Number(id); let live = true;
    getItem(n).then((x) => { if (x && live) fill(x); });
    listCols().then(setCols);
    const poll = async () => {
      let act: { kind: string; status: string; error: string } | null = null;
      for (const k of ['airead', 'transcribe']) {
        const j = await getJob(k, n);
        if (j && ['waiting', 'processing', 'failed'].includes(j.status)) { act = { kind: k, ...j }; break; }
      }
      if (!live) return;
      setJob(act);
      if (!act && was.current) { const x = await getItem(n); if (x) fill(x); }
      was.current = !!act;
    };
    poll(); const t = setInterval(poll, 4000);
    return () => { live = false; clearInterval(t); };
  }, [id]);

  if (!it) return <Screen><T muted style={{ padding: S.lg }}>This item no longer exists.</T></Screen>;
  const isPdf = it.mime === 'application/pdf';
  const readable = it.file_uri && (it.type === 'image' || isPdf);
  const hasText = it.type === 'image' || isPdf;

  const save = async () => { await updateItem(it.id, { title: title.trim() || it.title, body, note, col, ocr: hasText ? ocr : undefined }); kick(); r.back(); };
  const remind = async (when: number) => {
    if (when <= Date.now()) return Alert.alert('That time has passed', 'Pick a later time.');
    const ok = await addReminder(title || it.title, when, it.id);
    Alert.alert('Reminder set', ok ? 'Zee will notify you, even offline.' : 'Notifications are off, so you will only see it inside Zee. Turn them on in Android settings.');
  };
  const askAi = async (kind: 'airead' | 'transcribe') => {
    const p = await activeProvider();
    if (!p) return Alert.alert('Add an AI provider', 'Add one in Settings, then try again.');
    if (kind === 'transcribe') {
      if (p.kind === 'anthropic') return Alert.alert("Can't transcribe audio", `${p.name} doesn't accept audio. Make another provider active in Settings.`);
      if (p.kind === 'openai' && !p.sttModel) return Alert.alert('Set a transcription model', `Add one for ${p.name} in Settings, for example whisper-1.`);
    }
    Alert.alert(`Send to ${p.name}?`, `${kind === 'airead' ? 'This file' : 'This recording'} will be uploaded to ${p.name} to ${kind === 'airead' ? 'read its text' : 'transcribe it'}. Zee only does this when you ask. If you're offline it sends when you reconnect.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Send', onPress: async () => { await requestAi(kind, it.id); setJob({ kind, status: 'waiting', error: '' }); was.current = true; } }]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <T muted>Saved {new Date(it.created).toLocaleString()} · {it.type}</T>
        {it.type === 'image' && it.file_uri ? <Image source={{ uri: it.file_uri }} resizeMode="contain" style={{ width: '100%', height: 240, borderRadius: 12 }} /> : null}
        <Input value={title} onChangeText={setTitle} placeholder="Title" />
        {it.type === 'voice' && it.file_uri ? (
          <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'center' }}>
            <View style={{ flex: 1 }}><Btn label={ps.playing ? 'Pause' : 'Play recording'} onPress={() => { if (ps.playing) player.pause(); else { if (ps.didJustFinish || ps.currentTime >= (ps.duration || 1) - 0.1) player.seekTo(0); player.play(); } }} /></View>
            <T muted>{fmtDur((ps.currentTime || 0) * 1000)} / {fmtDur(it.dur)}</T>
          </View>
        ) : null}
        {it.file_uri ? <><T muted>{it.mime || 'file'} · {fmtSize(it.size)}</T><Btn label="Open or share file" kind="ghost" onPress={async () => { try { await Sharing.shareAsync(it.file_uri, { mimeType: it.mime || undefined }); } catch { Alert.alert("Can't open this file", 'No app on this phone can open it, or the file was removed.'); } }} /></> : null}
        {it.url ? <><T muted>{it.url}</T><Btn label="Open original" kind="ghost" onPress={() => Linking.openURL(it.url).catch(() => Alert.alert("Can't open this link", 'Check the address or your connection.'))} /></> : null}
        <Input value={body} onChangeText={setBody} placeholder={it.type === 'voice' ? 'Transcript' : 'Content'} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />
        {it.type === 'voice' && it.file_uri ? <Btn label="Transcribe with AI" kind="ghost" onPress={() => askAi('transcribe')} /> : null}
        {it.type === 'voice' && it.file_uri && body.trim() ? <Btn label="Delete audio, keep text" kind="ghost" onPress={() => Alert.alert('Delete the audio?', 'The transcript stays. The recording is removed from this phone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete audio', style: 'destructive', onPress: async () => { await updateItem(it.id, { title, body, note, col }); await dropFile(it.id); const x = await getItem(it.id); if (x) fill(x); } }])} /> : null}
        {hasText ? <>
          <T muted>{ocr ? 'Text found in this file (editable, used for search)' : it.type === 'image' ? 'No text found yet. Zee scans images on your phone with no internet. For handwriting or other languages, use Read with AI.' : "PDF text isn't extracted automatically. Use Read with AI to get it."}</T>
          {ocr ? <Input value={ocr} onChangeText={setOcr} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} /> : null}
        </> : null}
        {readable ? <Btn label="Read with AI" kind="ghost" onPress={() => askAi('airead')} /> : null}
        {job ? <T style={{ color: job.status === 'failed' ? C.danger : C.muted }}>
          {job.status === 'failed' ? `Failed: ${job.error}` : job.status === 'processing' ? 'Working on it…' : "Queued. It runs when you're online."}
        </T> : null}
        {job?.status === 'failed' ? <Btn label="Try again" kind="ghost" onPress={async () => { await requestAi(job.kind as 'airead' | 'transcribe', it.id); setJob({ ...job, status: 'waiting', error: '' }); }} /> : null}
        <Input value={note} onChangeText={setNote} placeholder="Your notes" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
        <RelatedPanel itemId={it.id} />
        <T muted>Collection</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label="Inbox" on={col === null} onPress={() => setCol(null)} />
          {cols.map((c) => <Chip key={c.id} label={c.name} color={c.color} on={col === c.id} onPress={() => setCol(c.id)} />)}
        </ScrollView>
        <T muted>Remind me about this</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{QUICK.map(([l, f]) => <Chip key={l} label={l} onPress={() => remind(f())} />)}</ScrollView>
        <Btn label="Track as opportunity" kind="ghost" onPress={() => r.push({ pathname: '/opportunity', params: { title: it.title, url: it.url } })} />
        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.md }}>
          <View style={{ flex: 1 }}><Btn label="Delete" kind="danger" onPress={() => Alert.alert('Delete this item?', "This can't be undone.", [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await removeItem(it.id); r.back(); } }])} /></View>
          <View style={{ flex: 2 }}><Btn label="Save changes" onPress={save} /></View>
        </View>
      </ScrollView>
    </Screen>
  );
}
