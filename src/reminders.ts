import * as N from 'expo-notifications';
import { Platform } from 'react-native';
import { db, deleteReminder, getReminder, insertReminder } from './db';

N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

export async function notificationsAllowed(ask = false) {
  if (Platform.OS === 'android') await N.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: N.AndroidImportance.HIGH });
  const p = await N.getPermissionsAsync();
  if (p.granted) return true;
  return ask ? (await N.requestPermissionsAsync()).granted : false;
}

// Local notifications are scheduled on the phone itself, so reminders fire with no internet.
export async function addReminder(title: string, due: number, itemId: number | null, ref = '') {
  const allowed = await notificationsAllowed(true);
  let nid = '';
  if (allowed && due > Date.now()) {
    nid = await N.scheduleNotificationAsync({
      content: { title: 'Zee reminder', body: title, data: { itemId } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(due), channelId: 'reminders' },
    });
  }
  await insertReminder(title, due, itemId, nid, ref);
  return allowed;
}
export async function cancelReminder(id: number, remove: boolean) {
  const r = await getReminder(id);
  if (r?.notif_id) await N.cancelScheduledNotificationAsync(r.notif_id).catch(() => {});
  if (remove) await deleteReminder(id);
}

export async function cancelByRef(ref: string) {
  const rows = await (await db()).getAllAsync<{ id: number }>('SELECT id FROM reminders WHERE ref=?', ref);
  for (const x of rows) await cancelReminder(x.id, true);
}

const at = (d: number, h: number) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.getTime(); };
export const QUICK: [string, () => number][] = [
  ['In 1 hour', () => Date.now() + 3600e3], ['Tonight 8pm', () => at(0, 20)], ['Tomorrow 9am', () => at(1, 9)],
  ['In 3 days', () => at(3, 9)], ['Next week', () => at(7, 9)],
];
export function parseWhen(s: string) { const t = new Date(s.trim().replace(' ', 'T')).getTime(); return isNaN(t) ? null : t; }
