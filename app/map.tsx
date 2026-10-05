import { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, View } from 'react-native';
import Svg, { G, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, Input, Chip, Btn, T } from '../src/ui';
import { C, S } from '../src/theme';
import { Col, listCols } from '../src/db';
import { EDGE_COLOR, GEdge, GNode, WORLD, buildGraph } from '../src/graph';
import { RelatedPanel } from '../src/related';

type V = { s: number; x: number; y: number };

export default function MapScreen() {
  const r = useRouter();
  const [g, setG] = useState<{ nodes: GNode[]; edges: GEdge[] } | null>(null);
  const [cols, setCols] = useState<Col[]>([]);
  const [col, setCol] = useState<number | null>(null);
  const [showAi, setShowAi] = useState(true);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef<V>({ s: 1, x: 0, y: 0 });
  const [v, setV] = useState<V>(view.current);
  const nodesRef = useRef<GNode[]>([]);
  const last = useRef<{ n: number; x: number; y: number; d: number } | null>(null);
  const tap = useRef({ moved: 0, t: 0, lx: 0, ly: 0, multi: false });
  const set = (nv: V) => { view.current = nv; setV(nv); };

  const fit = useCallback((w: number, h: number) => { const s = (Math.min(w, h) / WORLD) * 0.97; set({ s, x: (w - WORLD * s) / 2, y: (h - WORLD * s) / 2 }); }, []);
  const load = useCallback(async () => {
    const next = await buildGraph(col); nodesRef.current = next.nodes; setG(next); setCols(await listCols());
  }, [col]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (size.w) fit(size.w, size.h); }, [col, size.w, size.h, fit]);

  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { const n: any = e.nativeEvent; tap.current = { moved: 0, t: Date.now(), lx: n.locationX, ly: n.locationY, multi: false }; last.current = null; },
    onPanResponderMove: (e) => {
      const ts: any[] = e.nativeEvent.touches as any; const n = ts.length; if (!n) return;
      const x = ts.reduce((a, t) => a + t.locationX, 0) / n, y = ts.reduce((a, t) => a + t.locationY, 0) / n;
      const d = n > 1 ? Math.hypot(ts[0].locationX - ts[1].locationX, ts[0].locationY - ts[1].locationY) : 0;
      if (n > 1) tap.current.multi = true;
      const l = last.current;
      if (l && l.n === n) {
        const cur = view.current; let k = 1;
        if (n > 1 && l.d > 0) k = Math.min(4, Math.max(0.3, (cur.s * d) / l.d)) / cur.s;
        tap.current.moved += Math.hypot(x - l.x, y - l.y);
        set({ s: cur.s * k, x: x - (l.x - cur.x) * k, y: y - (l.y - cur.y) * k });
      }
      last.current = { n, x, y, d };
    },
    onPanResponderRelease: () => {
      const t = tap.current;
      if (t.multi || t.moved > 10 || Date.now() - t.t > 500) return;
      const { s, x, y } = view.current; const wx = (t.lx - x) / s, wy = (t.ly - y) / s;
      let best: GNode | null = null, bd = Infinity;
      for (const nd of nodesRef.current) { const d = Math.hypot(nd.x - wx, nd.y - wy); if (d < Math.max(nd.r + 8, 22 / s) && d < bd) { best = nd; bd = d; } }
      setSel(best ? best.id : null);
    },
  })).current;

  const ql = q.trim().toLowerCase();
  const nodes = g?.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const selNode = sel ? byId.get(sel) : undefined;
  const match = (n: GNode) => !ql || n.label.toLowerCase().includes(ql);

  return (
    <Screen>
      <View style={{ padding: S.md, gap: S.sm }}>
        <Input placeholder="Find in map" value={q} onChangeText={setQ} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label="All" on={col === null} onPress={() => setCol(null)} />
          {cols.map((c) => <Chip key={c.id} label={c.name} color={c.color} on={col === c.id} onPress={() => setCol(col === c.id ? null : c.id)} />)}
          <Chip label={showAi ? 'Suggestions: shown' : 'Suggestions: hidden'} on={showAi} onPress={() => setShowAi(!showAi)} />
          <Chip label="Reset view" onPress={() => fit(size.w, size.h)} />
        </ScrollView>
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pr.panHandlers}>
        <Svg width={size.w} height={size.h} pointerEvents="none">
          <G transform={`translate(${v.x} ${v.y}) scale(${v.s})`}>
            {(g?.edges ?? []).filter((e) => showAi || e.kind !== 'ai').map((e, i) => {
              const a = byId.get(e.a), b = byId.get(e.b); if (!a || !b) return null;
              return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGE_COLOR[e.kind]} strokeWidth={(e.kind === 'user' ? 3 : 1.5) / Math.sqrt(v.s)} strokeDasharray={e.kind === 'ai' ? '8 6' : undefined} opacity={ql && !(match(a) || match(b)) ? 0.15 : 0.9} />;
            })}
            {nodes.map((n) => {
              const hit = match(n), on = n.id === sel, label = n.kind === 'col' || on || (ql && hit) || v.s > 1.4;
              return (
                <G key={n.id} opacity={hit ? 1 : 0.2}>
                  <Circle cx={n.x} cy={n.y} r={n.r} fill={n.color} stroke={on ? '#fff' : ql && hit ? C.orange : C.bg} strokeWidth={on ? 4 : 3} />
                  {label ? <SvgText x={n.x} y={n.y + n.r + 16} fontSize={n.kind === 'col' ? 15 : 12} fontWeight={n.kind === 'col' ? 'bold' : 'normal'} fill={C.text} textAnchor="middle">{n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}</SvgText> : null}
                </G>
              );
            })}
          </G>
        </Svg>
        {g && !nodes.length ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: S.xl }} pointerEvents="none"><T muted style={{ textAlign: 'center' }}>Nothing to map yet. Save a few items and they appear here.</T></View> : null}
      </View>
      <View style={{ maxHeight: 280, borderTopWidth: 1, borderTopColor: C.border }}>
        <ScrollView contentContainerStyle={{ padding: S.md, gap: S.sm }}>
          {!selNode ? <T muted>Tap a node. Pinch to zoom, drag to pan. Grey lines: collections. Violet: links you made. Dashed orange: suggested by Zee.</T>
            : selNode.kind === 'col' ? <>
              <T style={{ fontWeight: '700', fontSize: 16 }}>{selNode.label}</T>
              <Btn label="Show in Library" kind="ghost" onPress={() => r.navigate({ pathname: '/library', params: { c: String(selNode.ref) } })} />
            </> : <>
              <Pressable onPress={() => r.push('/item/' + selNode.ref)}><T style={{ fontWeight: '700', fontSize: 16 }}>{selNode.label}</T><T muted>{selNode.type} · tap to open</T></Pressable>
              <RelatedPanel key={selNode.ref} itemId={selNode.ref} onChange={load} />
            </>}
        </ScrollView>
      </View>
    </Screen>
  );
}
