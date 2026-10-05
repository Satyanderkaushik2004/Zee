import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Screen, Input, Btn, T, fmtDur } from '../src/ui';
import { C, S } from '../src/theme';
import { getSetting } from '../src/db';
import { importFile } from '../src/files';
import { kick, requestAi } from '../src/jobs';

export default function Voice() {
  const r = useRouter();
  const rec = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const st = useAudioRecorderState(rec);
  const [uri, setUri] = useState<string | null>(null);
  const [dur, setDur] = useState(0);
  const [title, setTitle] = useState('');
  useEffect(() => () => { if (rec.isRecording) rec.stop().catch(() => {}); }, [rec]);

  const start = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return Alert.alert('Microphone is off', 'Allow microphone access in Android settings to record voice notes.');
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await rec.prepareToRecordAsync(); rec.record();
    } catch { Alert.alert("Couldn't start recording", 'Another app may be using the microphone.'); }
  };
  const stop = async () => {
    const ms = st.durationMillis;
    await rec.stop(); await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    setDur(ms); setUri(rec.uri);
  };
  const save = async () => {
    if (!uri) return;
    try {
      const id = await importFile(uri, `voice-${Date.now()}.m4a`, 'audio/mp4', 0, null, { type: 'voice', dur, title: title.trim() || 'Voice note ' + new Date().toLocaleString() });
      if ((await getSetting('autoTranscribe')) === '1') await requestAi('transcribe', id);
      kick(); r.back();
    } catch { Alert.alert("Couldn't save the recording", 'Check that your phone has free storage and try again.'); }
  };
  return (
    <Screen>
      <View style={{ padding: S.lg, gap: S.lg, alignItems: 'center' }}>
        <T style={{ fontSize: 48, fontWeight: '700', marginTop: S.xl }}>{fmtDur(uri ? dur : st.durationMillis)}</T>
        {!uri ? (
          <Btn label={st.isRecording ? 'Stop recording' : 'Start recording'} kind={st.isRecording ? 'danger' : 'primary'} onPress={st.isRecording ? stop : start} />
        ) : (
          <View style={{ width: '100%', gap: S.md }}>
            <Input placeholder="Title (optional)" value={title} onChangeText={setTitle} />
            <Btn label="Save voice note" onPress={save} />
            <Btn label="Discard and record again" kind="ghost" onPress={() => { setUri(null); setDur(0); }} />
          </View>
        )}
        <T muted style={{ textAlign: 'center', color: st.isRecording ? C.orange : C.muted }}>
          {st.isRecording ? 'Recording. Stay in Zee while you record.' : uri ? 'Saved on this phone only. Transcribing is optional and only happens when you ask.' : 'Voice notes are stored on this phone. Zee only records while you hold this screen open.'}
        </T>
      </View>
    </Screen>
  );
}
