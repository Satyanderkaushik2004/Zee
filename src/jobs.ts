import * as FS from 'expo-file-system/legacy';
import { db, getItem, updateItem, setOcr, getSetting } from './db';
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import { isOnline } from './net';
import { activeProvider, embed, readFile, transcribe } from './ai';

const RANGE: Record<string, RegExp> = {
  Latin: /[A-Za-z]/g, Devanagari: /[\u0900-\u097F]/g, Chinese: /[\u4E00-\u9FFF]/g, Japanese: /[\u3040-\u30FF\u4E00-\u9FFF]/g, Korean: /[\uAC00-\uD7AF]/g,
};
// Each script model also emits junk for text in other scripts, so keep only lines that look like they belong to the script that read them.
function keepLines(script: string, text: string) {
  return text.split('\n').map((l) => l.trim()).filter((l) => {
    const n = (l.match(RANGE[script]) ?? []).length; const all = l.replace(/\s/g, '').length;
    return all > 0 && n >= (script === 'Latin' ? 1 : 2) && n / all >= 0.4;
  });
}
async function ocrImage(uri: string) {
  const scripts: string[] = JSON.parse((await getSetting('ocrScripts')) ?? '["Latin"]');
  if (scripts.length <= 1) return ((await TextRecognition.recognize(uri))?.text ?? '').trim();
  const seen = new Set<string>(); const out: string[] = []; let ok = 0; let last: any;
  for (const s of ['Latin', ...scripts.filter((x) => x !== 'Latin')]) {
    try {
      const r = await TextRecognition.recognize(uri, s as TextRecognitionScript); ok++;
      for (const l of keepLines(s, r?.text ?? '')) if (!seen.has(l.toLowerCase())) { seen.add(l.toLowerCase()); out.push(l); }
    } catch (e) { last = e; }
  }
  if (!ok) throw last;
  return out.join('\n');
}
const b64Of = (uri: string) => FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
const MAX_SEND = 15 * 1024 * 1024;

type Job = { id: number; kind: string; item_id: number; attempts: number };
let running = false;

const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const metaTag = (h: string, prop: string) => {
  const a = h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'));
  const b = h.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return dec((a?.[1] ?? b?.[1] ?? ''));
};

async function runJob(j: Job): Promise<string> {
  const it = await getItem(j.item_id);
  if (!it) return 'done';
  if (j.kind === 'meta') {
    if (it.type !== 'link' || it.meta) return 'done';
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(it.url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Zee/0.2' } });
      if (!r.ok) throw new Error(`Page returned HTTP ${r.status}`);
      const h = (await r.text()).slice(0, 200000);
      const title = metaTag(h, 'og:title') || dec(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
      const desc = metaTag(h, 'og:description') || metaTag(h, 'description');
      const autoTitle = it.title === it.url || /^https?:\/\//i.test(it.title);
      await updateItem(it.id, { title: autoTitle && title ? title.slice(0, 140) : it.title, body: it.body || desc.slice(0, 500), note: it.note, col: it.col }, true);
      return 'done';
    } finally { clearTimeout(t); }
  }
  if (j.kind === 'ocr') {
    if (it.type !== 'image' || !it.file_uri) return 'done';
    await setOcr(it.id, (await ocrImage(it.file_uri)).slice(0, 20000));
    return 'done';
  }
  if (j.kind === 'airead') {
    const pdf = it.mime === 'application/pdf';
    if (!it.file_uri || (it.type !== 'image' && !pdf)) return 'done';
    if (it.size > MAX_SEND) throw new Error('This file is over 15 MB, too large to send.');
    const p = await activeProvider();
    if (!p) throw new Error('Add an AI provider in Settings first.');
    const text = await readFile(p, await b64Of(it.file_uri), pdf ? 'application/pdf' : it.mime || 'image/jpeg', it.title,
      'Extract all text from this file exactly as written, including handwriting, in its original language(s). Keep the reading order. If there is no text, output nothing.');
    await setOcr(it.id, text.slice(0, 50000));
    return 'done';
  }
  if (j.kind === 'transcribe') {
    if (!it.file_uri) return 'done';
    const p = await activeProvider();
    if (!p) throw new Error('Add an AI provider in Settings first.');
    const text = await transcribe(p, it.file_uri, () => b64Of(it.file_uri));
    if (text) await updateItem(it.id, { title: it.title, body: it.body ? it.body + '\n\n' + text : text, note: it.note, col: it.col });
    return 'done';
  }
  if (j.kind === 'embed') {
    const p = await activeProvider();
    if (!p || !p.embedModel) return 'skipped';
    const text = [it.title, it.body, it.note, it.ocr, it.url].filter(Boolean).join('\n').slice(0, 2000);
    const [v] = await embed(p, [text]);
    await (await db()).runAsync('INSERT OR REPLACE INTO embeddings(item_id,model,vec) VALUES(?,?,?)', it.id, p.embedModel, JSON.stringify(v.map((x) => Math.round(x * 1e4) / 1e4)));
    return 'done';
  }
  return 'done';
}

// Processes queued work whenever the phone is online. Saving never waits on this.
export async function kick() {
  if (running) return;
  running = true;
  try {
    const online = await isOnline();
    const kinds = online ? "('ocr','meta','embed','airead','transcribe')" : "('ocr')"; // text scanning runs on the phone, so it works offline
    const d = await db();
    await d.runAsync("UPDATE jobs SET status='waiting' WHERE status='processing'");
    for (let n = 0; n < 50; n++) {
      const j = await d.getFirstAsync<Job>(`SELECT * FROM jobs WHERE kind IN ${kinds} AND status IN ('waiting','failed') AND attempts<5 AND next_at<=? ORDER BY CASE kind WHEN 'ocr' THEN 0 ELSE 1 END, id LIMIT 1`, Date.now());
      if (!j) break;
      await d.runAsync("UPDATE jobs SET status='processing' WHERE id=?", j.id);
      try {
        const st = await runJob(j);
        await d.runAsync("UPDATE jobs SET status=?,error='' WHERE id=?", st, j.id);
      } catch (e: any) {
        const a = j.attempts + 1;
        await d.runAsync("UPDATE jobs SET status='failed',attempts=?,error=?,next_at=? WHERE id=?", a, String(e?.message ?? e).slice(0, 200), Date.now() + Math.pow(2, a) * 30000, j.id);
      }
    }
  } finally { running = false; }
}
export async function retryFailed() {
  await (await db()).runAsync("UPDATE jobs SET status='waiting',attempts=0,next_at=0,error='' WHERE status='failed'");
  await kick();
}
export async function indexLibrary() {
  await (await db()).runAsync(`INSERT INTO jobs(kind,item_id) SELECT 'embed',id FROM items WHERE id NOT IN (SELECT item_id FROM embeddings) ON CONFLICT(kind,item_id) DO UPDATE SET status='waiting',attempts=0,next_at=0,error=''`);
  await kick();
}
export async function scanImages(all = false) {
  await (await db()).runAsync(`INSERT INTO jobs(kind,item_id) SELECT 'ocr',id FROM items WHERE type='image' ${all ? '' : "AND ocr=''"} ON CONFLICT(kind,item_id) DO UPDATE SET status='waiting',attempts=0,next_at=0,error=''`);
  await kick();
}
// Queues an upload-to-provider job for one file. Only called after the user confirms for that file.
export async function requestAi(kind: 'airead' | 'transcribe', itemId: number) {
  const { enqueue } = await import('./db');
  await enqueue(kind, itemId, true);
  await kick();
}
