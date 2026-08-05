import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Users, Truck, Package, Search, ChevronDown, ChevronRight, Copy, MapPin } from 'lucide-react';
import type { FetchState, ResourceItem, Station } from '@/mock/types';
import { fetchForceStats, fetchResources, fetchStations, RESOURCE_TREE } from '@/mock/stations';
import { addSceneAction } from '@/mock/sceneLog';
import StatCard from '@/components/StatCard';
import StatusBadge, { statusVariantOf } from '@/components/StatusBadge';
import PanelStateView from '@/components/PanelStateView';
import DemoTag from '@/components/DemoTag';
import { showToast } from '@/components/Toast';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

type Row =
  | { kind: 'station'; station: Station }
  | { kind: 'resource'; item: ResourceItem };

export default function ForceResourcePanel() {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [state, setState] = useState<FetchState>('loading');
  const [stats, setStats] = useState<{ value: number; delta: string }[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [query, setQuery] = useState('');
  const [treeSel, setTreeSel] = useState<{ category: string; subtype?: string } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 队站: true });
  const [visible, setVisible] = useState(20);
  const [appending, setAppending] = useState(false);
  const [dialog, setDialog] = useState<Station | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (s: FetchState) => {
    if (s === 'loading') { setState('loading'); return; }
    setState('loading');
    try {
      const [st, rs, fs] = await Promise.all([
        fetchStations({ state: s }), fetchResources({ state: s }), fetchForceStats({ state: s }),
      ]);
      setStations(st);
      setResources(rs);
      setStats([fs.stations, fs.personnel, fs.vehicles, fs.equipment]);
      setState(st.length === 0 && rs.length === 0 ? 'empty' : 'ok');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { load(demoState); }, [demoState, load]);

  const rows = useMemo<Row[]>(() => {
    let list: Row[] = [];
    if (!treeSel || treeSel.category === '队站') {
      list = stations.map((s) => ({ kind: 'station' as const, station: s }));
      if (treeSel?.subtype) list = list.filter((r) => r.kind === 'station' && r.station.type === treeSel.subtype);
    } else {
      list = resources
        .filter((r) => r.category === treeSel.category && (!treeSel.subtype || r.subtype === treeSel.subtype))
        .map((item) => ({ kind: 'resource' as const, item }));
    }
    if (query.trim()) {
      const q = query.trim();
      list = list.filter((r) =>
        r.kind === 'station'
          ? r.station.name.includes(q) || r.station.address.includes(q)
          : r.item.name.includes(q) || r.item.subtype.includes(q));
    }
    return list;
  }, [stations, resources, treeSel, query]);

  const shown = rows.slice(0, visible);
  const allLoaded = visible >= rows.length;

  const onScroll = () => {
    const el = listRef.current;
    if (!el || allLoaded || appending) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight * 0.8) {
      setAppending(true);
      window.setTimeout(() => { setVisible((v) => v + 20); setAppending(false); }, 600);
    }
  };

  const writeLinkage = (s: Station) => {
    addSceneAction({ action: 'addMarker', target: `${s.name} @${s.lng},${s.lat}`, params: { lng: s.lng, lat: s.lat }, source: '面板' });
    addSceneAction({ action: 'flyTo', target: `${s.name} (${s.lng}, ${s.lat})`, params: { lng: s.lng, lat: s.lat }, source: '面板' });
    showToast('已写入场景动作日志 · 演示数据');
  };

  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="flex h-full flex-col">
      {/* 工具行 */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(20); }}
            placeholder="搜索队站 / 人员 / 车辆 / 装备…"
            className="h-8 w-full rounded-md border border-line bg-bg-panel-2 pl-7 pr-2 text-[13px] text-text-1 placeholder:text-text-3 focus:border-line-glow focus:outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={demoState}
            onChange={(e) => setDemoState(e.target.value as FetchState)}
            className="h-8 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-7 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
            title="状态演示"
          >
            {STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>状态演示：{o.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
        </div>
      </div>

      {state !== 'ok' ? (
        <PanelStateView state={state} onRetry={() => load('ok')} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-2 p-3">
            {[
              { icon: Flag, label: '队站数' },
              { icon: Users, label: '人员数' },
              { icon: Truck, label: '车辆数' },
              { icon: Package, label: '装备数' },
            ].map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.08 }}
              >
                <StatCard icon={c.icon} label={c.label} value={stats[i]?.value ?? 0} delta={stats[i]?.delta} />
              </motion.div>
            ))}
          </div>
          {/* 树 + 清单 */}
          <div className="flex min-h-0 flex-1 border-t border-line">
            {/* 分类树 */}
            <div className="w-[150px] shrink-0 overflow-y-auto border-r border-line py-1">
              {RESOURCE_TREE.map((group) => {
                const open = !!expanded[group.category];
                return (
                  <div key={group.category}>
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [group.category]: !p[group.category] }))}
                      className="flex w-full items-center gap-1 px-2 py-1.5 text-[13px] font-medium text-text-1 hover:bg-bg-panel-2"
                    >
                      {open ? <ChevronDown className="h-3.5 w-3.5 text-text-3" /> : <ChevronRight className="h-3.5 w-3.5 text-text-3" />}
                      {group.category}
                    </button>
                    <motion.div
                      initial={false}
                      animate={{ height: open ? 'auto' : 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      {group.children.map((ch) => {
                        const sel = treeSel?.category === group.category && treeSel.subtype === ch.name;
                        return (
                          <button
                            key={ch.name}
                            onClick={() => { setTreeSel(sel ? { category: group.category } : { category: group.category, subtype: ch.name }); setVisible(20); }}
                            className={`relative flex w-full items-center justify-between py-1.5 pl-7 pr-2 text-[12px] transition-colors hover:bg-bg-panel-2 ${
                              sel ? 'text-cyan' : 'text-text-2'
                            }`}
                          >
                            {sel && <span className="absolute left-0 top-0 h-full w-[2px] bg-cyan" />}
                            {ch.name}
                            <span className="font-num text-text-3">{ch.count.toLocaleString()}</span>
                          </button>
                        );
                      })}
                    </motion.div>
                  </div>
                );
              })}
            </div>
            {/* 清单 */}
            <div ref={listRef} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
              {shown.length === 0 ? (
                <PanelStateView state="empty" />
              ) : (
                <ul className="p-1.5">
                  <AnimatePresence initial={false}>
                    {shown.map((r, i) => {
                      const key = r.kind === 'station' ? r.station.id : r.item.id;
                      const name = r.kind === 'station' ? r.station.name : r.item.name;
                      const sub = r.kind === 'station' ? `${r.station.type} · 在位 ${r.station.personnel} 人` : `${r.item.subtype} · ${stationName(r.item.stationId)}`;
                      const status = r.kind === 'station' ? '在位' : r.item.status;
                      return (
                        <motion.li
                          key={key}
                          initial={{ x: -6, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ duration: 0.25, delay: Math.min(i % 20, 10) * 0.03 }}
                          onClick={() => {
                            if (r.kind === 'station') {
                              setDialog(r.station);
                              writeLinkage(r.station);
                            }
                          }}
                          className={`group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-bg-panel-2 ${
                            r.kind === 'station' ? '' : 'cursor-default'
                          }`}
                        >
                          <span className="absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 bg-cyan transition-all duration-200 group-hover:h-4/5" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] text-text-1">{name}</div>
                            <div className="truncate text-[11px] text-text-3">{sub}</div>
                          </div>
                          <StatusBadge label={status} variant={statusVariantOf(status)} pulse={status === '告警' || status === '离线'} />
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                  {appending &&
                    Array.from({ length: 3 }).map((_, i) => (
                      <li key={`sk-${i}`} className="mx-2 my-1.5 h-9 animate-pulse rounded-md bg-bg-panel-2" />
                    ))}
                  {allLoaded && (
                    <li className="py-2 text-center text-[11px] text-text-3">
                      已加载全部 {rows.length} 条 · 演示数据
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 队站详情弹窗 */}
      <AnimatePresence>
        {dialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 pl-[15%]"
            onClick={() => setDialog(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[380px] rounded-lg border border-line bg-bg-panel p-4 shadow-2xl"
            >
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold text-text-1">{dialog.name}</span>
                <span className="rounded border border-cyan/40 px-1.5 py-px text-[11px] text-cyan">{dialog.type}</span>
                <DemoTag className="ml-auto" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {[
                  ['联系人', dialog.contact],
                  ['值班电话', dialog.dutyPhone],
                  ['地址', dialog.address],
                ].map(([k, v], i) => (
                  <motion.div key={k} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="col-span-1">
                    <div className="text-[11px] text-text-3">{k}</div>
                    <div className="text-[13px] text-text-1">{v}</div>
                  </motion.div>
                ))}
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="col-span-1">
                  <div className="text-[11px] text-text-3">经纬度</div>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(`${dialog.lng}, ${dialog.lat}`);
                      showToast('坐标已复制');
                    }}
                    className="flex items-center gap-1 font-mono text-[13px] text-cyan hover:underline"
                    title="点击复制"
                  >
                    {dialog.lng}, {dialog.lat}
                    <Copy className="h-3 w-3" />
                  </button>
                </motion.div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setDialog(null)}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] text-text-2 transition hover:bg-white/5"
                >
                  关闭
                </button>
                <button
                  onClick={() => { writeLinkage(dialog); setDialog(null); }}
                  className="flex items-center gap-1.5 rounded-md border border-cyan/60 px-3 py-1.5 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.35)]"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  场景定位
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
