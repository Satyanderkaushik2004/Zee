import { db } from './db';
import { addReminder, cancelByRef } from './reminders';

export type Opp = { id: number; title: string; org: string; kind: string; url: string; deadline: number | null; status: string; notes: string; remind: number; created: number };
export type Sub = { id: number; name: string; price: number; currency: string; cycle: string; next_date: number; status: string; url: string; category: string; notes: string; created: number };
export const KINDS = ['Internship', 'Job', 'Hackathon', 'Scholarship', 'Event', 'Other'];
export const OPP_STATUS = ['Interested', 'Preparing', 'Applied', 'Interview', 'Accepted', 'Rejected'];
export const CLOSED = ['Accepted', 'Rejected'];
export const CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly'];
export const SUB_STATUS = ['active', 'paused', 'cancelled'];
const DAY = 86400000;

export function parseDate(s: string, endOfDay = true) {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3], endOfDay ? 23 : 9, endOfDay ? 59 : 0).getTime();
  return isNaN(t) ? null : t;
}
export const toInput = (t: number | null) => {
  if (t == null) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const daysLeft = (t: number) => Math.ceil((t - Date.now()) / DAY);
export const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function nextRenewal(s: Sub, now = Date.now()) {
  let t = s.next_date, i = 0;
  while (t < now && i++ < 600) {
    const d = new Date(t);
    if (s.cycle === 'weekly') d.setDate(d.getDate() + 7);
    else if (s.cycle === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (s.cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
    else d.setFullYear(d.getFullYear() + 1);
    t = d.getTime();
  }
  return t;
}
export const monthly = (s: Sub) => (s.cycle === 'weekly' ? (s.price * 52) / 12 : s.cycle === 'monthly' ? s.price : s.cycle === 'quarterly' ? s.price / 3 : s.price / 12);

export async function listOpps() {
  return (await db()).getAllAsync<Opp>('SELECT * FROM opportunities ORDER BY created DESC');
}
export async function listSubs() {
  return (await db()).getAllAsync<Sub>('SELECT * FROM subscriptions ORDER BY created DESC');
}
export async function saveOpp(o: Omit<Opp, 'id' | 'created'> & { id?: number; created?: number }) {
  const d = await db();
  let id = o.id;
  if (id) await d.runAsync('UPDATE opportunities SET title=?,org=?,kind=?,url=?,deadline=?,status=?,notes=?,remind=? WHERE id=?', o.title, o.org, o.kind, o.url, o.deadline, o.status, o.notes, o.remind, id);
  else id = (await d.runAsync('INSERT INTO opportunities(title,org,kind,url,deadline,status,notes,remind,created) VALUES(?,?,?,?,?,?,?,?,?)', o.title, o.org, o.kind, o.url, o.deadline, o.status, o.notes, o.remind, o.created ?? Date.now())).lastInsertRowId;
  await cancelByRef('opp:' + id);
  await syncTrackReminders();
  return id;
}
export async function deleteOpp(id: number) {
  await cancelByRef('opp:' + id);
  await (await db()).runAsync('DELETE FROM opportunities WHERE id=?', id);
}
export async function saveSub(s: Omit<Sub, 'id' | 'created'> & { id?: number; created?: number }) {
  const d = await db();
  let id = s.id;
  if (id) await d.runAsync('UPDATE subscriptions SET name=?,price=?,currency=?,cycle=?,next_date=?,status=?,url=?,category=?,notes=? WHERE id=?', s.name, s.price, s.currency, s.cycle, s.next_date, s.status, s.url, s.category, s.notes, id);
  else id = (await d.runAsync('INSERT INTO subscriptions(name,price,currency,cycle,next_date,status,url,category,notes,created) VALUES(?,?,?,?,?,?,?,?,?,?)', s.name, s.price, s.currency, s.cycle, s.next_date, s.status, s.url, s.category, s.notes, s.created ?? Date.now())).lastInsertRowId;
  await cancelByRef('sub:' + id);
  await syncTrackReminders();
  return id;
}
export async function deleteSub(id: number) {
  await cancelByRef('sub:' + id);
  await (await db()).runAsync('DELETE FROM subscriptions WHERE id=?', id);
}

// Makes sure every open deadline and active renewal has an upcoming reminder (1 day before a deadline, 2 days before a renewal).
export async function syncTrackReminders() {
  const d = await db(); const now = Date.now();
  const has = (ref: string, due: number) => d.getFirstAsync('SELECT id FROM reminders WHERE ref=? AND due=? AND done=0', ref, due);
  for (const o of await d.getAllAsync<Opp>("SELECT * FROM opportunities WHERE remind=1 AND deadline IS NOT NULL")) {
    const ref = 'opp:' + o.id, due = o.deadline! - DAY;
    if (CLOSED.includes(o.status)) { await cancelByRef(ref); continue; }
    if (due > now && !(await has(ref, due))) { await cancelByRef(ref); await addReminder('Deadline tomorrow: ' + o.title, due, null, ref); }
  }
  for (const s of await d.getAllAsync<Sub>('SELECT * FROM subscriptions')) {
    const ref = 'sub:' + s.id;
    if (s.status !== 'active') { await cancelByRef(ref); continue; }
    const due = nextRenewal(s) - 2 * DAY;
    if (due > now && !(await has(ref, due))) { await cancelByRef(ref); await addReminder(`${s.name} renews in 2 days (${s.currency} ${money(s.price)})`, due, null, ref); }
  }
}
