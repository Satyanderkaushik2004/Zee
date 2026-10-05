import * as SQLite from 'expo-sqlite';
import * as FS from 'expo-file-system/legacy';

export type Item = { id: number; type: string; title: string; body: string; note: string; url: string; fav: number; created: number; col: number | null; meta: number; file_uri: string; mime: string; size: number; ocr: string; dur: number };
export type Col = { id: number; name: string; color: string; n: number };
export type Reminder = { id: number; title: string; due: number; done: number; item_id: number | null; notif_id: string; ref: string };

let _db: SQLite.SQLiteDatabase | null = null;
export async function db() {
  if (_db) return _db;
  const d = await SQLite.openDatabaseAsync('zee.db');
  await d.execAsync('PRAGMA journal_mode=WAL;');
  const v = (await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version;
  if (v < 1) {
    await d.execAsync(`
      CREATE TABLE collections(id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE items(id INTEGER PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '', fav INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
        col INTEGER REFERENCES collections(id) ON DELETE SET NULL);
      CREATE INDEX idx_items_created ON items(created DESC);
      CREATE INDEX idx_items_col ON items(col);
      CREATE VIRTUAL TABLE items_fts USING fts5(title, body, url);
      CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  if (v < 2) {
    await d.execAsync(`
      ALTER TABLE items ADD COLUMN note TEXT NOT NULL DEFAULT '';
      ALTER TABLE items ADD COLUMN meta INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE jobs(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, item_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'waiting',
        attempts INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', next_at INTEGER NOT NULL DEFAULT 0, UNIQUE(kind,item_id));
      CREATE TABLE embeddings(item_id INTEGER PRIMARY KEY, model TEXT NOT NULL, vec TEXT NOT NULL);
      CREATE TABLE reminders(id INTEGER PRIMARY KEY, title TEXT NOT NULL, due INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0,
        item_id INTEGER, notif_id TEXT NOT NULL DEFAULT '');
      CREATE INDEX idx_reminders_due ON reminders(due);
      PRAGMA user_version=2;`);
  }
  if (v < 3) {
    await d.execAsync(`
      ALTER TABLE items ADD COLUMN file_uri TEXT NOT NULL DEFAULT '';
      ALTER TABLE items ADD COLUMN mime TEXT NOT NULL DEFAULT '';
      ALTER TABLE items ADD COLUMN size INTEGER NOT NULL DEFAULT 0;
      PRAGMA user_version=3;`);
  }
  if (v < 4) {
    await d.execAsync(`
      ALTER TABLE reminders ADD COLUMN ref TEXT NOT NULL DEFAULT '';
      CREATE TABLE opportunities(id INTEGER PRIMARY KEY, title TEXT NOT NULL, org TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'Other',
        url TEXT NOT NULL DEFAULT '', deadline INTEGER, status TEXT NOT NULL DEFAULT 'Interested', notes TEXT NOT NULL DEFAULT '',
        remind INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
      CREATE TABLE subscriptions(id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR',
        cycle TEXT NOT NULL DEFAULT 'monthly', next_date INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', url TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
      PRAGMA user_version=4;`);
  }
  if (v < 5) {
    await d.execAsync(`
      ALTER TABLE items ADD COLUMN ocr TEXT NOT NULL DEFAULT '';
      PRAGMA user_version=5;`);
  }
  if (v < 6) {
    await d.execAsync(`
      ALTER TABLE items ADD COLUMN dur INTEGER NOT NULL DEFAULT 0;
      PRAGMA user_version=6;`);
  }
  if (v < 7) {
    await d.execAsync(`
      CREATE TABLE links(a INTEGER NOT NULL, b INTEGER NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(a,b));
      PRAGMA user_version=7;`);
  }
  _db = d;
  return d;
}

export function detectType(text: string) { return /^https?:\/\/\S+$/i.test(text.trim()) ? 'link' : null; }
export function source(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

async function ftsPut(d: SQLite.SQLiteDatabase, id: number, title: string, body: string, note: string, url: string, ocr = '') {
  await d.runAsync('DELETE FROM items_fts WHERE rowid=?', id);
  await d.runAsync('INSERT INTO items_fts(rowid,title,body,url) VALUES(?,?,?,?)', id, title, (body + ' ' + note + ' ' + ocr).trim(), url);
}
export async function enqueue(kind: string, itemId: number, reset = false) {
  const d = await db();
  if (reset) await d.runAsync(`INSERT INTO jobs(kind,item_id) VALUES(?,?) ON CONFLICT(kind,item_id) DO UPDATE SET status='waiting',attempts=0,next_at=0,error=''`, kind, itemId);
  else await d.runAsync('INSERT OR IGNORE INTO jobs(kind,item_id) VALUES(?,?)', kind, itemId);
}

export async function addItem(p: { type: string; title: string; body: string; url: string; col: number | null; note?: string; created?: number; file_uri?: string; mime?: string; size?: number; dur?: number }) {
  const d = await db();
  let id = 0;
  await d.withTransactionAsync(async () => {
    const r = await d.runAsync('INSERT INTO items(type,title,body,note,url,created,col,file_uri,mime,size,dur) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      p.type, p.title, p.body, p.note ?? '', p.url, p.created ?? Date.now(), p.col, p.file_uri ?? '', p.mime ?? '', p.size ?? 0, p.dur ?? 0);
    id = r.lastInsertRowId;
    await ftsPut(d, id, p.title, p.body, p.note ?? '', p.url);
    await d.runAsync('INSERT OR IGNORE INTO jobs(kind,item_id) VALUES(?,?)', 'embed', id);
    if (p.type === 'link') await d.runAsync('INSERT OR IGNORE INTO jobs(kind,item_id) VALUES(?,?)', 'meta', id);
    if (p.type === 'image') await d.runAsync('INSERT OR IGNORE INTO jobs(kind,item_id) VALUES(?,?)', 'ocr', id);
  });
  return id;
}
export async function getItem(id: number) {
  return (await db()).getFirstAsync<Item>('SELECT * FROM items WHERE id=?', id);
}
export async function updateItem(id: number, p: { title: string; body: string; note: string; col: number | null; ocr?: string }, auto = false) {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('UPDATE items SET title=?,body=?,note=?,col=?,ocr=COALESCE(?,ocr),meta=CASE WHEN ? THEN 1 ELSE meta END WHERE id=?', p.title, p.body, p.note, p.col, p.ocr ?? null, auto ? 1 : 0, id);
    const it = (await d.getFirstAsync<{ url: string; ocr: string }>('SELECT url, ocr FROM items WHERE id=?', id))!;
    await ftsPut(d, id, p.title, p.body, p.note, it.url, it.ocr);
    await d.runAsync('DELETE FROM embeddings WHERE item_id=?', id);
  });
  await enqueue('embed', id, true);
}
export async function setOcr(id: number, text: string) {
  const it = await getItem(id);
  if (!it) return;
  await updateItem(id, { title: it.title, body: it.body, note: it.note, col: it.col, ocr: text });
}
export async function findByUrl(url: string) {
  return (await db()).getFirstAsync<{ id: number }>("SELECT id FROM items WHERE url=? AND url!=''", url);
}
export async function fileStats() {
  const r = await (await db()).getFirstAsync<{ n: number; s: number | null }>("SELECT COUNT(*) n, SUM(size) s FROM items WHERE file_uri!=''");
  return { n: r!.n, bytes: r!.s ?? 0 };
}
export async function removeItem(id: number) {
  const d = await db();
  const f = await d.getFirstAsync<{ file_uri: string }>('SELECT file_uri FROM items WHERE id=?', id);
  if (f?.file_uri) await FS.deleteAsync(f.file_uri, { idempotent: true }).catch(() => {});
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM items WHERE id=?', id);
    await d.runAsync('DELETE FROM items_fts WHERE rowid=?', id);
    await d.runAsync('DELETE FROM embeddings WHERE item_id=?', id);
    await d.runAsync('DELETE FROM jobs WHERE item_id=?', id);
    await d.runAsync('DELETE FROM links WHERE a=? OR b=?', id, id);
  });
}
export async function toggleFav(id: number) { await (await db()).runAsync('UPDATE items SET fav=1-fav WHERE id=?', id); }
export async function listItems(o: { col?: number | null; type?: string | null; fav?: boolean; limit?: number } = {}) {
  const w: string[] = []; const a: (string | number)[] = [];
  if (o.col != null) { w.push('col=?'); a.push(o.col); }
  if (o.type) { w.push('type=?'); a.push(o.type); }
  if (o.fav) w.push('fav=1');
  return (await db()).getAllAsync<Item>(`SELECT * FROM items ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY created DESC LIMIT ${o.limit ?? 200}`, a);
}
export async function search(q: string, limit = 30) {
  const t = q.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!t) return [] as Item[];
  return (await db()).getAllAsync<Item>(
    `SELECT i.* FROM items_fts f JOIN items i ON i.id=f.rowid WHERE items_fts MATCH ? ORDER BY rank LIMIT ?`, t.map((x) => `"${x}"*`).join(' '), limit);
}
export async function itemsByIds(ids: number[]) {
  if (!ids.length) return [] as Item[];
  const rows = await (await db()).getAllAsync<Item>(`SELECT * FROM items WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  return ids.map((i) => rows.find((r) => r.id === i)).filter(Boolean) as Item[];
}
export async function stats() {
  const d = await db();
  const n = async (s: string) => (await d.getFirstAsync<{ n: number }>(s))!.n;
  return { items: await n('SELECT COUNT(*) n FROM items'), inbox: await n('SELECT COUNT(*) n FROM items WHERE col IS NULL'), cols: await n('SELECT COUNT(*) n FROM collections') };
}
export async function listCols() {
  return (await db()).getAllAsync<Col>('SELECT c.id,c.name,c.color,(SELECT COUNT(*) FROM items i WHERE i.col=c.id) n FROM collections c ORDER BY c.created');
}
export async function addCol(name: string, color: string) {
  return (await (await db()).runAsync('INSERT INTO collections(name,color,created) VALUES(?,?,?)', name, color, Date.now())).lastInsertRowId;
}
export async function removeCol(id: number) { await (await db()).runAsync('DELETE FROM collections WHERE id=?', id); }
export async function getSetting(k: string) {
  const r = await (await db()).getFirstAsync<{ v: string }>('SELECT v FROM settings WHERE k=?', k);
  return r?.v ?? null;
}
export async function setSetting(k: string, v: string) {
  await (await db()).runAsync('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, v);
}
// reminders
export async function listReminders() { return (await db()).getAllAsync<Reminder>('SELECT * FROM reminders ORDER BY done, due'); }
export async function insertReminder(title: string, due: number, itemId: number | null, notif: string, ref = '') {
  await (await db()).runAsync('INSERT INTO reminders(title,due,item_id,notif_id,ref) VALUES(?,?,?,?,?)', title, due, itemId, notif, ref);
}
export async function getReminder(id: number) { return (await db()).getFirstAsync<Reminder>('SELECT * FROM reminders WHERE id=?', id); }
export async function setReminderDone(id: number, done: boolean) { await (await db()).runAsync('UPDATE reminders SET done=? WHERE id=?', done ? 1 : 0, id); }
export async function deleteReminder(id: number) { await (await db()).runAsync('DELETE FROM reminders WHERE id=?', id); }
// jobs
export async function jobStats() {
  const rows = await (await db()).getAllAsync<{ status: string; n: number }>(`SELECT status, COUNT(*) n FROM jobs WHERE status IN ('waiting','processing','failed') GROUP BY status`);
  const g = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return { waiting: g('waiting') + g('processing'), failed: g('failed') };
}

export async function getJob(kind: string, itemId: number) {
  return (await db()).getFirstAsync<{ status: string; error: string }>('SELECT status,error FROM jobs WHERE kind=? AND item_id=?', kind, itemId);
}
// Deletes the stored audio but keeps the transcript.
export async function dropFile(id: number) {
  const d = await db();
  const f = await d.getFirstAsync<{ file_uri: string }>('SELECT file_uri FROM items WHERE id=?', id);
  if (f?.file_uri) await FS.deleteAsync(f.file_uri, { idempotent: true }).catch(() => {});
  await d.runAsync("UPDATE items SET file_uri='',size=0 WHERE id=?", id);
}
