import { db, addCol, addItem, listCols, listItems, listReminders } from './db';
import { addReminder } from './reminders';
import { listOpps, listSubs, saveOpp, saveSub } from './track';

export async function exportAll() {
  const d = await db();
  const cols = await d.getAllAsync('SELECT id,name,color,created FROM collections');
  const items = await listItems({ limit: 100000 });
  const reminders = await listReminders();
  return JSON.stringify({ app: 'zee', v: 1, exported: Date.now(), collections: cols, items, reminders, opportunities: await listOpps(), subscriptions: await listSubs() });
}

export async function importAll(json: string) {
  const j = JSON.parse(json);
  if (j?.app !== 'zee' || j.v !== 1) throw new Error("This isn't a Zee backup.");
  const d = await db();
  const map = new Map<number, number>();
  const have = await listCols();
  for (const c of j.collections ?? []) {
    const ex = have.find((x) => x.name === c.name);
    map.set(c.id, ex ? ex.id : await addCol(c.name, c.color));
  }
  let items = 0, skipped = 0;
  for (const it of j.items ?? []) {
    if (it.file_uri) { skipped++; continue; }
    const dup = await d.getFirstAsync('SELECT id FROM items WHERE created=? AND title=?', it.created, it.title);
    if (dup) continue;
    await addItem({ type: it.type, title: it.title, body: it.body ?? '', note: it.note ?? '', url: it.url ?? '', created: it.created, col: it.col != null ? map.get(it.col) ?? null : null });
    items++;
  }
  let rem = 0;
  for (const r of j.reminders ?? []) {
    if (r.done) continue;
    const dup = await d.getFirstAsync('SELECT id FROM reminders WHERE due=? AND title=?', r.due, r.title);
    if (dup) continue;
    await addReminder(r.title, r.due, null); rem++;
  }
  const have2 = await listOpps(); const have3 = await listSubs();
  for (const o of j.opportunities ?? []) if (!have2.some((x) => x.title === o.title && x.created === o.created)) { await saveOpp({ ...o, id: undefined }); }
  for (const s of j.subscriptions ?? []) if (!have3.some((x) => x.name === s.name && x.created === s.created)) { await saveSub({ ...s, id: undefined }); }
  return { items, rem, skipped };
}
