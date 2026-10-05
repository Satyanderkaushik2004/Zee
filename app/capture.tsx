import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { importFile } from '../src/files';
import { Screen, Input, Btn, Chip, T } from '../src/ui';
import { S } from '../src/theme';
import { Col, addItem, detectType, listCols } from '../src/db';
import { kick } from '../src/jobs';

const TYPES = ['note', 'link', 'snippet', 'command', 'prompt', 'idea'];

export default function Capture() {
  const r = useRouter();
  const [type, setType] = useState('note');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [col, setCol] = useState<number | null>(null);
  const [cols, setCols] = useState<Col[]>([]);
  useEffect(() => { listCols().then(setCols); }, []);

  const paste = async () => {
    const t = (await Clipboard.getStringAsync()).trim();
    if (!t) return Alert.alert('Clipboard is empty', 'Copy something first, then tap Paste.');
    setText(t);
    if (detectType(t)) setType('link');
  };
  const pickFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    let ok = 0;
    for (const a of res.assets) { try { await importFile(a.uri, a.name, a.mimeType ?? '', a.size ?? 0, col); ok++; } catch {} }
    kick();
    if (ok) r.back(); else Alert.alert("Couldn't save the file", 'Check that the file is still available and your phone has free storage.');
  };
  const save = async () => {
    const t = text.trim();
    if (!t && !title.trim()) return Alert.alert('Nothing to save', 'Type or paste something first.');
    const isLink = type === 'link' || !!detectType(t);
    const url = isLink ? t.split(/\s+/)[0] : '';
    await addItem({ type: isLink ? 'link' : type, title: title.trim() || t.split('\n')[0].slice(0, 80) || url, body: isLink ? '' : t, url, col });
    kick();
    r.back();
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md }} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>{TYPES.map((x) => <Chip key={x} label={x} on={type === x} onPress={() => setType(x)} />)}</ScrollView>
        <Input placeholder="Title (optional)" value={title} onChangeText={setTitle} />
        <Input placeholder={type === 'link' ? 'https://…' : 'Write or paste here'} value={text} onChangeText={setText} multiline autoFocus style={{ minHeight: 140, textAlignVertical: 'top' }} />
        <T muted>Collection (leave empty to save in your inbox)</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cols.map((c) => <Chip key={c.id} label={c.name} color={c.color} on={col === c.id} onPress={() => setCol(col === c.id ? null : c.id)} />)}
        </ScrollView>
        <Btn label="Add files or images" kind="ghost" onPress={pickFiles} />
        <Btn label="Record a voice note" kind="ghost" onPress={() => r.replace('/voice')} />
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <View style={{ flex: 1 }}><Btn label="Paste" kind="ghost" onPress={paste} /></View>
          <View style={{ flex: 2 }}><Btn label="Save" onPress={save} /></View>
        </View>
      </ScrollView>
    </Screen>
  );
}
