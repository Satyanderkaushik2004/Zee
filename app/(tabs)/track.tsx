import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, Btn, Chip, T, Empty } from '../../src/ui';
import { C, S } from '../../src/theme';
import { CLOSED, Opp, Sub, daysLeft, fmtDate, listOpps, listSubs, money, monthly, nextRenewal, syncTrackReminders } from '../../src/track';

const dueLabel = (t: number) => { const n = daysLeft(t); return n < 0 ? 'Deadline passed' : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `${n} days left`; };

export default function Track() {
  const r = useRouter();
  const [tab, setTab] = useState<'opp' | 'sub'>('opp');
  const [opps, setOpps] = useState<Opp[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const load = useCallback(async () => {
    const o = await listOpps();
    const rank = (x: Opp) => (CLOSED.includes(x.status) ? 2 : x.deadline == null ? 1 : 0);
    setOpps(o.sort((a, b) => rank(a) - rank(b) || (a.deadline ?? 0) - (b.deadline ?? 0)));
    const s = await listSubs();
    setSubs(s.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || nextRenewal(a) - nextRenewal(b)));
    syncTrackReminders().catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = opps.filter((o) => !CLOSED.includes(o.status));
  const soon = open.filter((o) => o.deadline && daysLeft(o.deadline) >= 0 && daysLeft(o.deadline) <= 7).length;
  const totals = new Map<string, number>();
  subs.filter((s) => s.status === 'active').forEach((s) => totals.set(s.currency, (totals.get(s.currency) ?? 0) + monthly(s)));

  return (
    <Screen>
      <View style={{ padding: S.lg, gap: S.md }}>
        <View style={{ flexDirection: 'row' }}>
          <Chip label="Opportunities" on={tab === 'opp'} onPress={() => setTab('opp')} />
          <Chip label="Subscriptions" on={tab === 'sub'} onPress={() => setTab('sub')} />
        </View>
        {tab === 'opp' ? (
          <T muted>{open.length} open · {soon} due in the next 7 days</T>
        ) : totals.size ? (
          [...totals.entries()].map(([cur, m]) => <T key={cur} style={{ fontSize: 16, fontWeight: '600' }}>{cur} {money(m)} / month · {cur} {money(m * 12)} / year</T>)
        ) : <T muted>Totals appear once you add an active subscription.</T>}
        <Btn label={tab === 'opp' ? 'Add opportunity' : 'Add subscription'} onPress={() => r.push(tab === 'opp' ? '/opportunity' : '/subscription')} />
      </View>
      {tab === 'opp' ? (
        <FlatList contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 60 }} data={opps} keyExtractor={(x) => String(x.id)}
          renderItem={({ item: o }) => {
            const closed = CLOSED.includes(o.status); const n = o.deadline ? daysLeft(o.deadline) : null;
            const hot = !closed && n != null && n >= 0 && n <= 3;
            return (
              <Pressable onPress={() => r.push({ pathname: '/opportunity', params: { id: String(o.id) } })} style={{ backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 10, opacity: closed ? 0.55 : 1, borderLeftWidth: 3, borderLeftColor: hot ? C.orange : C.violet, gap: 2 }}>
                <T style={{ fontWeight: '600' }}>{o.title}</T>
                <T muted>{[o.org, o.kind, o.status].filter(Boolean).join(' · ')}</T>
                {o.deadline ? <T style={{ color: hot ? C.orange : C.muted }}>{fmtDate(o.deadline)} · {closed ? 'closed' : dueLabel(o.deadline)}</T> : <T muted>No deadline set</T>}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Empty title="No opportunities yet" hint="Add one here, or open a saved item and tap Track as opportunity." />} />
      ) : (
        <FlatList contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 60 }} data={subs} keyExtractor={(x) => String(x.id)}
          renderItem={({ item: s }) => {
            const act = s.status === 'active'; const nx = nextRenewal(s); const n = daysLeft(nx);
            return (
              <Pressable onPress={() => r.push({ pathname: '/subscription', params: { id: String(s.id) } })} style={{ backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 10, opacity: act ? 1 : 0.55, borderLeftWidth: 3, borderLeftColor: act && n <= 3 ? C.orange : C.indigo, gap: 2 }}>
                <T style={{ fontWeight: '600' }}>{s.name} · {s.currency} {money(s.price)} / {s.cycle}</T>
                <T muted>{[s.category, s.status].filter(Boolean).join(' · ')}</T>
                {act ? <T style={{ color: n <= 3 ? C.orange : C.muted }}>Renews {fmtDate(nx)} · {n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</T> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Empty title="No subscriptions yet" hint="Add the services you pay for to see monthly and yearly totals and get renewal reminders." />} />
      )}
    </Screen>
  );
}
