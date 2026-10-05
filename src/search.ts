import { db, Item, itemsByIds, search } from './db';
import { activeProvider, embed } from './ai';
import { isOnline } from './net';

const cos = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / (Math.sqrt(x * y) || 1);
};

// Keyword search always works offline. When online and an embedding model is set, results are merged with meaning-based matches.
export async function hybrid(q: string, limit = 12): Promise<{ items: Item[]; smart: boolean }> {
  const kw = await search(q, 20);
  try {
    const p = await activeProvider();
    if (!p?.embedModel || !(await isOnline())) return { items: kw.slice(0, limit), smart: false };
    const rows = await (await db()).getAllAsync<{ item_id: number; vec: string }>('SELECT item_id,vec FROM embeddings WHERE model=?', p.embedModel);
    if (!rows.length) return { items: kw.slice(0, limit), smart: false };
    const [qv] = await embed(p, [q], 8000);
    const sem = rows.map((r) => ({ id: r.item_id, s: cos(qv, JSON.parse(r.vec)) })).sort((a, b) => b.s - a.s).slice(0, 20);
    const score = new Map<number, number>();
    kw.forEach((it, i) => score.set(it.id, (score.get(it.id) ?? 0) + 1 / (60 + i)));
    sem.forEach((r, i) => score.set(r.id, (score.get(r.id) ?? 0) + 1 / (60 + i)));
    const ids = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((e) => e[0]);
    return { items: await itemsByIds(ids), smart: true };
  } catch { return { items: kw.slice(0, limit), smart: false }; }
}
