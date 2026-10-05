import { useEffect } from 'react';
import { AppState, ToastAndroid } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as N from 'expo-notifications';
import { ShareIntentProvider, useShareIntent } from 'expo-share-intent';
import { C } from '../src/theme';
import { kick } from '../src/jobs';
import { addItem, findByUrl } from '../src/db';
import { importFile } from '../src/files';
import '../src/reminders';

// Shows the error on screen instead of closing the app when a screen fails to render.
export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

// Saves anything shared to Zee from other apps straight into the Inbox, with no internet needed.
function ShareHandler() {
  const r = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent) return;
    (async () => {
      let saved = 0, dup = 0, failed = 0;
      try {
        const si = shareIntent as any;
        const text = String(si.webUrl || si.text || '').trim();
        if (text) {
          const url = text.match(/https?:\/\/\S+/)?.[0] ?? '';
          if (url && (await findByUrl(url))) dup++;
          else {
            await addItem({ type: url ? 'link' : 'note', title: url || text.split('\n')[0].slice(0, 80), body: url ? text.replace(url, '').trim() : text, url, col: null });
            saved++;
          }
        }
        for (const f of (si.files ?? []) as any[]) {
          try { await importFile(f.path, f.fileName || 'shared-file', f.mimeType || '', f.size || 0, null); saved++; } catch { failed++; }
        }
      } catch { failed++; } finally { resetShareIntent(); }
      if (saved) kick();
      ToastAndroid.show(saved ? `Saved ${saved} to your Zee inbox` : dup ? 'Already saved in Zee' : failed ? "Couldn't save that to Zee" : 'Nothing to save', ToastAndroid.SHORT);
      r.navigate('/');
    })();
  }, [hasShareIntent]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function Root() {
  const r = useRouter();
  useEffect(() => {
    kick();
    const id = setInterval(kick, 20000);
    const a = AppState.addEventListener('change', (s) => { if (s === 'active') kick(); });
    const n = N.addNotificationResponseReceivedListener((resp) => {
      const itemId = resp.notification.request.content.data?.itemId;
      if (itemId) r.push('/item/' + itemId);
    });
    return () => { clearInterval(id); a.remove(); n.remove(); };
  }, [r]);
  return (
    <ShareIntentProvider>
      <ShareHandler />
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal', title: 'Save to Zee' }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
        <Stack.Screen name="map" options={{ title: 'ThoughtMap' }} />
        <Stack.Screen name="voice" options={{ title: 'Voice note' }} />
        <Stack.Screen name="opportunity" options={{ title: 'Opportunity' }} />
        <Stack.Screen name="subscription" options={{ title: 'Subscription' }} />
      </Stack>
    </ShareIntentProvider>
  );
}
