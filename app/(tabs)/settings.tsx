import { useCallback, useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { Screen, Input, Btn, Chip, T, H } from '../../src/ui';
import { C, S } from '../../src/theme';
import { jobStats, fileStats, getSetting, setSetting } from '../../src/db';
import { fmtSize } from '../../src/ui';
import { exportAll, importAll } from '../../src/backup';
import { indexLibrary, retryFailed, scanImages } from '../../src/jobs';
import { PRESETS, Provider, Kind, activeId, chat, deleteProvider, listProviders, saveProvider, setActive } from '../../src/ai';

export default function Settings() {
  const [ps, setPs] = useState<Provider[]>([]);
  const [act, setAct] = useState<string | null>(null);
  const [preset, setPreset] = useState(PRESETS[0].name);
  const [name, setName] = useState(PRESETS[0].name);
  const [kind, setKind] = useState<Kind>('openai');
  const [url, setUrl] = useState(PRESETS[0].baseUrl);
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [sttModel, setSttModel] = useState('');
  const [scripts, setScripts] = useState<string[]>(['Latin']);
  const [auto, setAuto] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [q, setQ] = useState({ waiting: 0, failed: 0 });
  const [fs, setFs] = useState({ n: 0, bytes: 0 });
  const load = useCallback(async () => { setPs(await listProviders()); setAct(await activeId()); setQ(await jobStats()); setFs(await fileStats());
    setScripts(JSON.parse((await getSetting('ocrScripts')) ?? '["Latin"]')); setAuto((await getSetting('autoTranscribe')) === '1');
    setHidden(JSON.parse((await getSetting('homeHidden')) ?? '[]')); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pick = (n: string) => {
    const p = PRESETS.find((x) => x.name === n)!;
    setPreset(n); setName(p.name === 'Custom' ? '' : p.name); setKind(p.kind); setUrl(p.baseUrl);
  };
  const build = (): Provider => ({ id: 'p' + Date.now(), name: name.trim(), kind, baseUrl: url.trim(), model: model.trim(), embedModel: embedModel.trim() || undefined, sttModel: sttModel.trim() || undefined });
  const valid = () => name.trim() && url.trim() && model.trim() && key.trim();
  const test = async () => {
    if (!valid()) return Alert.alert('Missing details', 'Fill in name, base URL, model and API key.');
    const p = build();
    try {
      await saveProvider(p, key.trim());
      const out = await chat(p, 'Reply with one word.', [{ role: 'user', content: 'Say OK' }]);
      Alert.alert('Connected', `${p.name} replied: ${out.slice(0, 60)}`);
      setKey(''); setModel(''); setEmbedModel(''); setSttModel(''); load();
    } catch (e: any) { await deleteProvider(p.id); Alert.alert('Connection failed', e.message); }
  };
  const save = async () => {
    if (!valid()) return Alert.alert('Missing details', 'Fill in name, base URL, model and API key.');
    await saveProvider(build(), key.trim()); setKey(''); setModel(''); setEmbedModel(''); setSttModel(''); load();
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <H>AI providers</H>
        <T muted>Bring any provider. Your key stays in Android's secure storage on this phone. Zee only sends the few saved items relevant to a question.</T>
        {ps.map((p) => (
          <View key={p.id} style={{ backgroundColor: C.card, borderRadius: 14, padding: S.md, gap: S.sm }}>
            <T style={{ fontWeight: '700' }}>{p.name}{act === p.id ? '  ·  active' : ''}</T>
            <T muted>{p.model} — {p.baseUrl}{p.embedModel ? ' · smart search: ' + p.embedModel : ''}{p.sttModel ? ' · transcription: ' + p.sttModel : ''}</T>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              {act !== p.id && <View style={{ flex: 1 }}><Btn label="Use this" kind="ghost" onPress={async () => { await setActive(p.id); load(); }} /></View>}
              <View style={{ flex: 1 }}><Btn label="Remove" kind="danger" onPress={async () => { await deleteProvider(p.id); load(); }} /></View>
            </View>
          </View>
        ))}
        <T style={{ fontWeight: '700', marginTop: S.md }}>Add a provider</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{PRESETS.map((p) => <Chip key={p.name} label={p.name} on={preset === p.name} onPress={() => pick(p.name)} />)}</ScrollView>
        <Input placeholder="Display name" value={name} onChangeText={setName} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['openai', 'anthropic', 'gemini'] as Kind[]).map((k) => <Chip key={k} label={k === 'openai' ? 'OpenAI-compatible' : k} on={kind === k} onPress={() => setKind(k)} />)}
        </ScrollView>
        <Input placeholder="Base URL" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />
        <Input placeholder="Model name (e.g. from your provider's docs)" value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} />
        <Input placeholder="Embedding model for smart search (optional)" value={embedModel} onChangeText={setEmbedModel} autoCapitalize="none" autoCorrect={false} />
        <Input placeholder="Transcription model for voice notes (optional, e.g. whisper-1)" value={sttModel} onChangeText={setSttModel} autoCapitalize="none" autoCorrect={false} />
        <Input placeholder="API key" value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <View style={{ flex: 1 }}><Btn label="Save" kind="ghost" onPress={save} /></View>
          <View style={{ flex: 1 }}><Btn label="Test and save" onPress={test} /></View>
        </View>
        <T style={{ fontWeight: '700', marginTop: S.lg }}>Smart search and background work</T>
        <T muted>{q.waiting} waiting · {q.failed} failed. Zee retries automatically when you're online.</T>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <View style={{ flex: 1 }}><Btn label="Index my library" kind="ghost" onPress={async () => { await indexLibrary(); load(); Alert.alert('Indexing started', 'Needs a provider with an embedding model and an internet connection.'); }} /></View>
          <View style={{ flex: 1 }}><Btn label="Scan image text" kind="ghost" onPress={() => Alert.alert('Scan image text', 'Zee reads text in images on this phone, no internet needed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Images without text', onPress: async () => { await scanImages(false); load(); } }, { text: 'All images', onPress: async () => { await scanImages(true); load(); } }])} /></View>
          <View style={{ flex: 1 }}><Btn label="Retry failed" kind="ghost" onPress={async () => { await retryFailed(); load(); }} /></View>
        </View>
        <T style={{ fontWeight: '700', marginTop: S.lg }}>Home screen</T>
        <T muted>Choose what Home shows.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
          {[['stats', 'Counts'], ['queue', 'Waiting notice'], ['soon', 'Coming up'], ['recent', 'Recently saved']].map(([k, l]) => (
            <Chip key={k} label={l} on={!hidden.includes(k)} onPress={async () => { const n = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]; setHidden(n); await setSetting('homeHidden', JSON.stringify(n)); }} />
          ))}
        </View>
        <T style={{ fontWeight: '700', marginTop: S.lg }}>Languages in images</T>
        <T muted>Latin (English and similar) is always on. Add scripts below, then rescan. Each extra script is checked too, so scanning takes a little longer.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
          {[['Devanagari', 'Hindi (Devanagari)'], ['Chinese', 'Chinese'], ['Japanese', 'Japanese'], ['Korean', 'Korean']].map(([k, l]) => (
            <Chip key={k} label={l} on={scripts.includes(k)} onPress={async () => { const n = scripts.includes(k) ? scripts.filter((x) => x !== k) : [...scripts, k]; setScripts(n); await setSetting('ocrScripts', JSON.stringify(['Latin', ...n.filter((x) => x !== 'Latin')])); }} />
          ))}
        </View>
        <T style={{ fontWeight: '700', marginTop: S.lg }}>Voice notes</T>
        <T muted>Recordings stay on this phone. Transcribing sends the audio to your active provider, so it is off unless you choose it per note or switch this on.</T>
        <View style={{ flexDirection: 'row' }}><Chip label={auto ? 'Auto-transcribe new voice notes: on' : 'Auto-transcribe new voice notes: off'} on={auto} onPress={async () => { setAuto(!auto); await setSetting('autoTranscribe', auto ? '0' : '1'); }} /></View>
        <T style={{ fontWeight: '700', marginTop: S.lg }}>Storage</T>
        <T muted>{fs.n} saved file{fs.n === 1 ? '' : 's'} · {fmtSize(fs.bytes)} on this phone.</T>
        <T style={{ fontWeight: '700', marginTop: S.lg }}>Backup</T>
        <T muted>Your data lives only on this phone. Backups cover text items, links, collections, reminders, opportunities and subscriptions, not saved files. Keep a copy somewhere safe (Drive, WhatsApp to yourself, a notes app).</T>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <View style={{ flex: 1 }}><Btn label="Share backup" kind="ghost" onPress={async () => { try { await Share.share({ message: await exportAll() }); } catch (e: any) { Alert.alert('Could not share', e.message); } }} /></View>
          <View style={{ flex: 1 }}><Btn label="Copy backup" kind="ghost" onPress={async () => { await Clipboard.setStringAsync(await exportAll()); Alert.alert('Copied', 'Paste it somewhere safe.'); }} /></View>
        </View>
        <Btn label="Restore from clipboard" kind="ghost" onPress={() => Alert.alert('Restore backup?', 'Items already on this phone are skipped. Nothing is deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Restore', onPress: async () => { try { const r = await importAll(await Clipboard.getStringAsync()); Alert.alert('Restored', `${r.items} items and ${r.rem} reminders added.${r.skipped ? ' ' + r.skipped + ' file entries were skipped because backups do not include files.' : ''}`); load(); } catch (e: any) { Alert.alert('Could not restore', e.message.includes('JSON') ? 'The clipboard does not hold a Zee backup. Copy the whole backup text first.' : e.message); } } }])} />
        <T muted style={{ marginTop: S.lg }}>Zee 0.8.0 — all data stays on this device.</T>
      </ScrollView>
    </Screen>
  );
}
