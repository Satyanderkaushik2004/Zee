import * as FS from 'expo-file-system/legacy';
import { addItem } from './db';

const dir = (FS.documentDirectory ?? '') + 'files/';

// Copies a picked or shared file into Zee's private storage so it stays available offline.
export async function importFile(srcUri: string, name: string, mime: string, size: number, col: number | null, extra: { type?: string; dur?: number; title?: string } = {}) {
  await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const dest = dir + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
  await FS.copyAsync({ from: srcUri.startsWith('/') ? 'file://' + srcUri : srcUri, to: dest });
  const info: any = await FS.getInfoAsync(dest);
  if (!info.exists) throw new Error('Copy failed');
  return addItem({ type: extra.type ?? (mime.startsWith('image/') ? 'image' : 'file'), dur: extra.dur, title: extra.title || name, body: '', url: '', col, file_uri: dest, mime, size: size || info.size || 0 });
}
