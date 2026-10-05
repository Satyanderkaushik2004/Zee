import { Col, Item, db, getItem, itemsByIds, listCols, listItems } from './db';
import { C } from './theme';

const STOP = new Set('this that with from have your about there their would could should which what when where will been were they them then than into over some more also just like very much make made only other such'.split(' '));
const tokCache = new Map<number, Set<string>>();
const tok = (it: Item) => {
  const key = it.id * 31 + it.title.length + it.body.length + it.note.length + it.ocr.length;
  let s = tokCache.get(key);
  if (!s) {
    const m = `${it.title} ${it.body} ${it.note} ${it.ocr}`.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
    s = new Set(m.filter((w) => !STOP.has(w)).slice(0, 300)); tokCache.set(key, s);
  }
  return s;
};
const jac = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };

async function vectors(ids: number[]) {
  const m = new Map<number, number[]>();
  if (!ids.length) return m;
  const rows = await (await db()).getAllAsync<{ item_id: number; model: string; vec: string }>(`SELECT item_id,model,vec FROM embeddings WHERE item_id IN (${ids.map(() => '?').join(',')})`, ids);
  const count = new Map<string, number>();
  rows.forEach((r) => count.set(r.model, (count.get(r.model) ?? 0) + 1));
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const r of rows) if (r.model === best) m.set(r.item_id, JSON.parse(r.vec));
  return m;
}
// Best matches for one item. Uses embeddings when both items have them, else shared words. Thresholds adapt to each provider's score range.
function topFor(me: Item, cands: Item[], vecs: Map<number, number[]>, k: number) {
  const va = vecs.get(me.id);
  const sc = cands.filter((c) => c.id !== me.id).map((c) => { const vb = vecs.get(c.id); return va && vb ? { id: c.id, s: cos(va, vb), e: true } : { id: c.id, s: jac(tok(me), tok(c)), e: false }; });
  const emb = sc.filter((x) => x.e).map((x) => x.s);
  let thr = 0.35;
  if (emb.length > 2) { const mean = emb.reduce((a, b) => a + b, 0) / emb.length; const sd = Math.sqrt(emb.reduce((a, b) => a + (b - mean) ** 2, 0) / emb.length); thr = Math.max(0.35, mean + 1.2 * sd); }
  return sc.filter((x) => (x.e ? x.s >= thr : x.s >= 0.12)).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.id);
}

const pair = (a: number, b: number) => (a < b ? [a, b] : [b, a]);
async function links() {
  const rows = await (await db()).getAllAsync<{ a: number; b: number; kind: string }>('SELECT a,b,kind FROM links');
  return { user: rows.filter((r) => r.kind === 'user'), rejected: new Set(rows.filter((r) => r.kind === 'rejected').map((r) => r.a + ':' + r.b)) };
}
export async function link(a: number, b: number) { const [x, y] = pair(a, b); await (await db()).runAsync("INSERT INTO links(a,b,kind) VALUES(?,?,'user') ON CONFLICT(a,b) DO UPDATE SET kind='user'", x, y); }
// Removing a link or dismissing a suggestion both mean "don't show this pair again".
export async function dismiss(a: number, b: number) { const [x, y] = pair(a, b); await (await db()).runAsync("INSERT INTO links(a,b,kind) VALUES(?,?,'rejected') ON CONFLICT(a,b) DO UPDATE SET kind='rejected'", x, y); }

export async function relatedFor(id: number) {
  const me = await getItem(id);
  if (!me) return { linked: [] as Item[], suggested: [] as Item[] };
  const L = await links();
  const linkedIds = L.user.filter((r) => r.a === id || r.b === id).map((r) => (r.a === id ? r.b : r.a));
  const cands = (await listItems({ limit: 300 })).filter((c) => c.id !== id);
  const vecs = await vectors([id, ...cands.map((c) => c.id)]);
  const sug = topFor(me, cands, vecs, 8).filter((x) => !linkedIds.includes(x) && !L.rejected.has(pair(id, x).join(':'))).slice(0, 5);
  return { linked: await itemsByIds(linkedIds), suggested: await itemsByIds(sug) };
}

export type GNode = { id: string; kind: 'item' | 'col'; ref: number; label: string; color: string; r: number; x: number; y: number; type?: string };
export type GEdge = { a: string; b: string; kind: 'member' | 'user' | 'ai' };
export const WORLD = 1000;

export async function buildGraph(colId: number | null) {
  const items = await listItems({ col: colId, limit: 80 });
  const cols = await listCols();
  const colById = new Map<number, Col>(cols.map((c) => [c.id, c]));
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const usedCols = new Set<number>();
  for (const it of items) {
    const c = it.col != null ? colById.get(it.col) : undefined;
    nodes.push({ id: 'i' + it.id, kind: 'item', ref: it.id, label: it.title, color: c?.color ?? '#6F6E8A', r: 12, x: 0, y: 0, type: it.type });
    if (c) { usedCols.add(c.id); edges.push({ a: 'i' + it.id, b: 'c' + c.id, kind: 'member' }); }
  }
  for (const id of usedCols) { const c = colById.get(id)!; nodes.push({ id: 'c' + id, kind: 'col', ref: id, label: c.name, color: c.color, r: 22, x: 0, y: 0 }); }
  const L = await links();
  const have = new Set(items.map((i) => i.id));
  const seen = new Set<string>();
  for (const r of L.user) if (have.has(r.a) && have.has(r.b)) { edges.push({ a: 'i' + r.a, b: 'i' + r.b, kind: 'user' }); seen.add(r.a + ':' + r.b); }
  const vecs = await vectors(items.map((i) => i.id));
  for (const it of items) {
    for (const j of topFor(it, items, vecs, 3)) {
      const key = pair(it.id, j).join(':');
      if (seen.has(key) || L.rejected.has(key)) continue;
      seen.add(key); edges.push({ a: 'i' + it.id, b: 'i' + j, kind: 'ai' });
    }
  }
  layout(nodes, edges);
  return { nodes, edges };
}

// Force-directed layout, seeded by node ids so the picture stays roughly stable between reloads.
function layout(nodes: GNode[], edges: GEdge[]) {
  const n = nodes.length; if (!n) return;
  const seed = (s: string, k: number) => { let h = k * 2654435761; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };
  nodes.forEach((v) => { v.x = seed(v.id, 1) * WORLD; v.y = seed(v.id, 2) * WORLD; });
  const idx = new Map(nodes.map((v, i) => [v.id, i]));
  const k = Math.sqrt((WORLD * WORLD) / n) * 0.8;
  let temp = WORLD / 8;
  for (let it = 0; it < 160; it++) {
    const dx = new Array(n).fill(0), dy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let ex = nodes[i].x - nodes[j].x, ey = nodes[i].y - nodes[j].y; let d = Math.hypot(ex, ey) || 0.01;
      const f = (k * k) / d; ex /= d; ey /= d;
      dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f;
    }
    for (const e of edges) {
      const i = idx.get(e.a)!, j = idx.get(e.b)!;
      let ex = nodes[i].x - nodes[j].x, ey = nodes[i].y - nodes[j].y; const d = Math.hypot(ex, ey) || 0.01;
      const f = ((d * d) / k) * (e.kind === 'ai' ? 0.4 : 1); ex /= d; ey /= d;
      dx[i] -= ex * f; dy[i] -= ey * f; dx[j] += ex * f; dy[j] += ey * f;
    }
    for (let i = 0; i < n; i++) {
      dx[i] -= (nodes[i].x - WORLD / 2) * 0.05; dy[i] -= (nodes[i].y - WORLD / 2) * 0.05;
      const d = Math.hypot(dx[i], dy[i]) || 0.01; const m = Math.min(d, temp);
      nodes[i].x += (dx[i] / d) * m; nodes[i].y += (dy[i] / d) * m;
    }
    temp *= 0.96;
  }
  const xs = nodes.map((v) => v.x), ys = nodes.map((v) => v.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), sc = (WORLD - 120) / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1);
  nodes.forEach((v) => { v.x = 60 + (v.x - x0) * sc; v.y = 60 + (v.y - y0) * sc; });
}
export const EDGE_COLOR = { member: '#3A3A4D', user: C.violet, ai: C.orange };
