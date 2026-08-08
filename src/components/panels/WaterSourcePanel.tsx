'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, Search, ChevronDown, MapPin, Eye, EyeOff } from 'lucide-react';
import type { FetchState, WaterSource } from '@/mock/types';
import { fetchWaterStats, fetchWaterSourcesPage, type WaterStats } from '@/api/water';
import { DISTRICT_NAME } from '@/lib/water-mapper';
import { waterIconSvg } from '@/lib/map-icons';
import { useMapLayerPrefs, toggleWaterDistrictHidden } from '@/lib/map-layer-store';
import { addSceneAction } from '@/mock/sceneLog';
import StatCard from '@/components/StatCard';
import PanelStateView from '@/components/PanelStateView';
import { showToast } from '@/components/Toast';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

const TYPE_ORDER = ['市政消火栓', '消防水池', '天然水源'];
const PAGE_SIZE = 20;

export default function WaterSourcePanel() {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [state, setState] = useState<FetchState>('loading');
  const [stats, setStats] = useState<WaterStats | null>(null);
  const [list, setList] = useState<WaterSource[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [districtSel, setDistrictSel] = useState<string | null>(null); // districtCode | null(全部)
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState(''); // 防抖后的搜索词
  const [appending, setAppending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const layerPrefs = useMapLayerPrefs();

  // 统计(全局聚合,一次)
  const load = useCallback(async (s: FetchState) => {
    if (s === 'loading') { setState('loading'); return; }
    setState('loading');
    try {
      if (s === 'error') throw new Error('demo');
      if (s === 'empty') {
        setStats({ total: 0, by_type: [], by_district: [] });
      } else {
        setStats(await fetchWaterStats());
      }
      setState(s === 'empty' ? 'empty' : 'ok');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { load(demoState); }, [demoState, load]);

  // 搜索词防抖 300ms
  useEffect(() => {
    const t = window.setTimeout(() => setKeyword(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  // 清单:服务端分页 + 区划/关键词过滤
  useEffect(() => {
    if (state !== 'ok') return;
    let alive = true;
    setAppending(true);
    fetchWaterSourcesPage({ districtCode: districtSel ?? undefined, keyword: keyword || undefined, page, pageSize: PAGE_SIZE })
      .then(({ items, total }) => {
        if (!alive) return;
        setTotal(total);
        setList((prev) => (page === 1 ? items : [...prev, ...items]));
      })
      .catch(() => {})
      .finally(() => { if (alive) setAppending(false); });
    return () => { alive = false; };
  }, [state, districtSel, keyword, page]);

  // 过滤条件变化时回到第一页
  useEffect(() => { setPage(1); }, [districtSel, keyword]);

  const districtStats = useMemo(() => {
    const rows = stats?.by_district ?? [];
    return rows
      .map((d) => ({ districtCode: d.district_code, district: DISTRICT_NAME[d.district_code] ?? '未知', count: d.count }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  const typeStats = useMemo(() => {
    const rows = stats?.by_type ?? [];
    return rows
      .map((t) => ({ type: t.water_type, count: t.count }))
      .sort((a, b) => {
        const ia = TYPE_ORDER.indexOf(a.type);
        const ib = TYPE_ORDER.indexOf(b.type);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.type.localeCompare(b.type);
      });
  }, [stats]);

  const allLoaded = list.length >= total;
  const onScroll = () => {
    const el = listRef.current;
    if (!el || allLoaded || appending) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight * 0.8) setPage((p) => p + 1);
  };

  const writeLinkage = (w: WaterSource) => {
    addSceneAction({ action: 'flyTo', target: `${w.name} (${w.lng}, ${w.lat})`, params: { id: w.id, lng: w.lng, lat: w.lat }, source: '面板' });
    showToast('已定位到水源');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 工具行 */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索水源名称 / 地址…"
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
          {/* 统计:总数 + 类型小计 */}
          <div className="space-y-2 p-3">
            <StatCard icon={Droplet} label="水源总数" value={stats?.total ?? 0} />
            <div className="flex flex-wrap gap-2">
              {typeStats.map((t) => (
                <span key={t.type} className="rounded border border-line bg-bg-panel-2 px-2 py-0.5 text-[11px] text-text-2">
                  {t.type} <span className="font-num text-text-1">{t.count}</span>
                </span>
              ))}
            </div>
          </div>
          {/* 区树 + 清单 */}
          <div className="flex min-h-0 flex-1 border-t border-line">
            <div className="w-[110px] shrink-0 overflow-y-auto border-r border-line py-1">
              <button
                onClick={() => setDistrictSel(null)}
                className={`flex w-full items-center justify-between px-2 py-1.5 text-[12px] hover:bg-bg-panel-2 ${districtSel === null ? 'text-cyan' : 'text-text-2'}`}
              >
                全部
                <span className="font-num text-text-3">{(stats?.total ?? 0).toLocaleString()}</span>
              </button>
              {districtStats.map((d) => {
                const sel = districtSel === d.districtCode;
                const hiddenOnMap = layerPrefs.hiddenWaterDistricts.includes(d.districtCode);
                return (
                  <div key={d.districtCode} className="relative flex items-center">
                    <button
                      onClick={() => setDistrictSel(sel ? null : d.districtCode)}
                      className={`relative flex min-w-0 flex-1 items-center justify-between py-1.5 pl-2 pr-1 text-[12px] hover:bg-bg-panel-2 ${sel ? 'text-cyan' : 'text-text-2'}`}
                    >
                      {sel && <span className="absolute left-0 top-0 h-full w-[2px] bg-cyan" />}
                      <span className={`truncate ${hiddenOnMap ? 'line-through opacity-50' : ''}`}>{d.district}</span>
                      <span className="font-num text-text-3">{d.count.toLocaleString()}</span>
                    </button>
                    <button
                      onClick={() => toggleWaterDistrictHidden(d.districtCode)}
                      title={hiddenOnMap ? '在地图上显示该区水源' : '在地图上隐藏该区水源'}
                      className={`shrink-0 px-1.5 py-1.5 transition ${hiddenOnMap ? 'text-text-3' : 'text-cyan hover:text-cyan/70'}`}
                    >
                      {hiddenOnMap ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div ref={listRef} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
              {list.length === 0 && !appending ? (
                <PanelStateView state="empty" />
              ) : (
                <ul className="p-1.5">
                  <AnimatePresence initial={false}>
                    {list.map((w, i) => (
                      <motion.li
                        key={w.id}
                        initial={{ x: -6, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.25, delay: Math.min(i % 20, 10) * 0.03 }}
                        onClick={() => writeLinkage(w)}
                        className="group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-bg-panel-2"
                      >
                        <span className="absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 bg-cyan transition-all duration-200 group-hover:h-4/5" />
                        <span className="h-[18px] w-[18px] shrink-0" dangerouslySetInnerHTML={{ __html: waterIconSvg(w.type) }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-text-1">{w.name}</div>
                          <div className="truncate text-[11px] text-text-3">{w.address || `${w.district} · ${w.type}`}</div>
                        </div>
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                  {appending && Array.from({ length: 3 }).map((_, i) => (
                    <li key={`sk-${i}`} className="mx-2 my-1.5 h-9 animate-pulse rounded-md bg-bg-panel-2" />
                  ))}
                  {allLoaded && list.length > 0 && (
                    <li className="py-2 text-center text-[11px] text-text-3">已加载全部 {total} 条</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
