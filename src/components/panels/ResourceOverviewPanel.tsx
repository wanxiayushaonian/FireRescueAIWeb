'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Users, Truck, Package, Search, ChevronDown, ChevronRight, Copy, MapPin, Eye, EyeOff, Droplet, Building2 } from 'lucide-react';
import type { FetchState, ResourceItem, Station, WaterSource } from '@/mock/types';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import { fetchStations, fetchResources } from '@/api/force';
import { fetchWaterStats, fetchWaterSourcesPage, type WaterStats } from '@/api/water';
import { fetchKeyUnits } from '@/api/key-units';
import { buildForceStats, buildResourceTree, type ResourceTreeGroup } from '@/lib/force-mapper';
import { DISTRICT_NAME } from '@/lib/water-mapper';
import { useMapLayerPrefs, toggleStationTypeVisible, toggleWaterDistrictHidden, toggleKeyUnitTypeHidden } from '@/lib/map-layer-store';
import { addSceneAction } from '@/mock/sceneLog';
import StatCard from '@/components/StatCard';
import StatusBadge, { statusVariantOf } from '@/components/StatusBadge';
import PanelStateView from '@/components/PanelStateView';
import { showToast } from '@/components/Toast';

/** 水源状态中文映射 */
const WATER_STATUS_MAP: Record<string, string> = {
  normal: '正常',
  available: '可用',
  unavailable: '不可用',
  maintenance: '维保中',
  offline: '离线',
  alarm: '告警',
};

/** 重点单位状态中文映射 */
const KEYUNIT_STATUS_MAP: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  normal: '正常',
  active: '活跃',
  inactive: '未激活',
  maintenance: '维保中',
  offline: '离线',
  alarm: '告警',
};

/** 根据 Tab 类型转换状态为中文 */
function localizeStatus(tab: TabKey, status: string): string {
  if (tab === 'water') return WATER_STATUS_MAP[status] ?? status;
  if (tab === 'keyunit') return KEYUNIT_STATUS_MAP[status] ?? status;
  return status;
}

type TabKey = 'force' | 'water' | 'keyunit';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Flag }> = [
  { key: 'force', label: '执勤力量', icon: Flag },
  { key: 'water', label: '水源', icon: Droplet },
  { key: 'keyunit', label: '重点单位', icon: Building2 },
];

type Row =
  | { kind: 'station'; station: Station }
  | { kind: 'resource'; item: ResourceItem }
  | { kind: 'water'; water: WaterSource }
  | { kind: 'keyunit'; unit: KeyUnit };

export default function ResourceOverviewPanel() {
  const [tab, setTab] = useState<TabKey>('force');
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [state, setState] = useState<FetchState>('loading');

  // 执勤力量数据
  const [stats, setStats] = useState<{ value: number; delta?: string }[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [tree, setTree] = useState<ResourceTreeGroup[]>([]);

  // 水源数据
  const [waterStats, setWaterStats] = useState<WaterStats | null>(null);
  const [waterList, setWaterList] = useState<WaterSource[]>([]);
  const [waterTotal, setWaterTotal] = useState(0);
  const [waterPage, setWaterPage] = useState(1);

  // 重点单位数据
  const [keyUnits, setKeyUnits] = useState<KeyUnit[]>([]);

  // 通用状态
  const [query, setQuery] = useState('');
  const [treeSel, setTreeSel] = useState<{ category: string; subtype?: string } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 队站: true, 区县: true, 类型: true });
  const [visible, setVisible] = useState(20);
  const [appending, setAppending] = useState(false);
  const [dialog, setDialog] = useState<Station | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const layerPrefs = useMapLayerPrefs();

  // 区域过滤（从 GIS 地图点击区县触发）
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);

  // 加载执勤力量数据
  const loadForce = useCallback(async (s: FetchState) => {
    if (s === 'loading') { setState('loading'); return; }
    setState('loading');
    try {
      const [st, rs] = await Promise.all([fetchStations(s), fetchResources(s)]);
      setStations(
        st.map((station) => ({
          ...station,
          personnel: rs.filter((r) => r.stationId === station.id && r.category === '人员').length,
        })),
      );
      setResources(rs);
      setStats(buildForceStats(st, rs));
      setTree(buildResourceTree(st, rs));
      setState(st.length === 0 && rs.length === 0 ? 'empty' : 'ok');
    } catch {
      setState('error');
    }
  }, []);

  // 加载水源统计
  const loadWaterStats = useCallback(async (s: FetchState) => {
    if (s === 'loading' || s === 'empty') {
      setWaterStats({ total: 0, by_type: [], by_district: [] });
      return;
    }
    try {
      setWaterStats(await fetchWaterStats());
    } catch {
      // ignore
    }
  }, []);

  // 上次水源请求的过滤键（区县+关键词），变化时强制回第一页，避免旧页码竞态
  const lastWaterKeyRef = useRef<string>('');

  // 加载水源列表（服务端分页：每页 20 条；过滤条件变化时自动回第一页）
  const loadWaterList = useCallback(async () => {
    // 如果选择了区县分类，使用该区县过滤
    const selectedDistrictCode = treeSel?.category === '区县' && treeSel.subtype
      ? Object.entries(DISTRICT_NAME).find(([, name]) => name === treeSel.subtype)?.[0]
      : undefined;
    const effectiveCode = selectedDistrictCode ?? districtFilter ?? undefined;
    const key = `${effectiveCode ?? ''}|${query.trim()}`;

    // 过滤条件变化：本次直接请求第 1 页并替换列表，同时同步页码状态
    const filterChanged = key !== lastWaterKeyRef.current;
    if (filterChanged) lastWaterKeyRef.current = key;
    const page = filterChanged ? 1 : waterPage;

    setAppending(true);
    try {
      const { items, total } = await fetchWaterSourcesPage({
        districtCode: effectiveCode,
        keyword: query.trim() || undefined,
        page,
        pageSize: 20,
      });
      setWaterTotal(total);
      setWaterList((prev) => (filterChanged || page === 1 ? items : [...prev, ...items]));
    } catch {
      // ignore
    } finally {
      setAppending(false);
    }

    // 过滤变化时同步页码状态，让后续滚动从第 2 页继续
    if (filterChanged) setWaterPage(1);
  }, [districtFilter, query, waterPage, treeSel]);

  // 加载重点单位
  const loadKeyUnits = useCallback(async () => {
    try {
      const units = await fetchKeyUnits();
      setKeyUnits(units);
    } catch {
      // ignore
    }
  }, []);

  // 初始加载
  useEffect(() => { loadForce(demoState); }, [demoState, loadForce]);
  useEffect(() => { loadWaterStats(demoState); }, [demoState, loadWaterStats]);
  useEffect(() => { loadKeyUnits(); }, [loadKeyUnits]);

  // 水源列表加载（waterPage=1 表示首次或过滤变化，直接替换列表；>1 追加）
  useEffect(() => {
    if (tab === 'water' && state === 'ok') {
      loadWaterList();
    }
  }, [tab, state, loadWaterList]);

  // 监听 GIS 地图区县点击事件
  useEffect(() => {
    const onDistrictSelect = (e: Event) => {
      const detail = (e as CustomEvent<{ districtCode: string | null }>).detail;
      setDistrictFilter(detail?.districtCode ?? null);
    };
    window.addEventListener('gis:select-district', onDistrictSelect);
    return () => window.removeEventListener('gis:select-district', onDistrictSelect);
  }, []);

  // 按区域过滤执勤力量
  const filteredStations = useMemo(() => {
    if (!districtFilter) return stations;
    return stations.filter((s) => s.districtCode === districtFilter || s.address.includes(DISTRICT_NAME[districtFilter] ?? ''));
  }, [stations, districtFilter]);

  const filteredResources = useMemo(() => {
    if (!districtFilter) return resources;
    const stationIds = new Set(filteredStations.map((s) => s.id));
    return resources.filter((r) => stationIds.has(r.stationId) || r.districtCode === districtFilter);
  }, [resources, districtFilter, filteredStations]);

  const filteredKeyUnits = useMemo(() => {
    if (!districtFilter) return keyUnits;
    return keyUnits.filter((u) => u.district === DISTRICT_NAME[districtFilter] || u.district === districtFilter);
  }, [keyUnits, districtFilter]);

  // 构建当前 Tab 的行数据
  const rows = useMemo<Row[]>(() => {
    let list: Row[] = [];

    if (tab === 'force') {
      if (!treeSel || treeSel.category === '队站') {
        list = filteredStations.map((s) => ({ kind: 'station' as const, station: s }));
        if (treeSel?.subtype) list = list.filter((r) => r.kind === 'station' && r.station.type === treeSel.subtype);
      } else {
        list = filteredResources
          .filter((r) => r.category === treeSel.category && (!treeSel.subtype || r.subtype === treeSel.subtype))
          .map((item) => ({ kind: 'resource' as const, item }));
      }
    } else if (tab === 'water') {
      // 服务端已按 districtCode 过滤，直接用 waterList
      list = waterList.map((w) => ({ kind: 'water' as const, water: w }));
    } else if (tab === 'keyunit') {
      list = filteredKeyUnits.map((u) => ({ kind: 'keyunit' as const, unit: u }));
      // 按类型过滤
      if (treeSel?.category === '类型' && treeSel.subtype) {
        list = list.filter((r) => r.kind === 'keyunit' && r.unit.unitType === treeSel.subtype);
      }
    }

    if (query.trim()) {
      const q = query.trim();
      list = list.filter((r) => {
        if (r.kind === 'station') return r.station.name.includes(q) || r.station.address.includes(q);
        if (r.kind === 'resource') return r.item.name.includes(q) || r.item.subtype.includes(q);
        if (r.kind === 'water') return r.water.name.includes(q) || r.water.address.includes(q);
        if (r.kind === 'keyunit') return r.unit.name.includes(q) || (r.unit.address ?? '').includes(q);
        return false;
      });
    }

    return list;
  }, [tab, treeSel, filteredStations, filteredResources, waterList, filteredKeyUnits, query]);

  // 水源 Tab 走服务端分页（每页 20 条已加载到 waterList），直接展示全部；其他 Tab 走客户端虚拟滚动切片
  const shown = tab === 'water' ? rows : rows.slice(0, visible);
  const allLoaded = tab === 'water'
    ? waterList.length >= waterTotal
    : visible >= rows.length;

  const onScroll = () => {
    const el = listRef.current;
    if (!el || appending) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight * 0.8) {
      // 水源 Tab 走服务端分页：还有更多数据时加载下一页
      if (tab === 'water' && waterList.length < waterTotal) {
        setAppending(true);
        setWaterPage((p) => p + 1);
      } else if (visible < rows.length) {
        // 其他 Tab 走客户端虚拟滚动
        setAppending(true);
        window.setTimeout(() => { setVisible((v) => v + 20); setAppending(false); }, 600);
      }
    }
  };

  const writeLinkage = (s: Station) => {
    addSceneAction({ action: 'addMarker', target: `${s.name} @${s.lng},${s.lat}`, params: { id: s.id, lng: s.lng, lat: s.lat }, source: '面板' });
    addSceneAction({ action: 'flyTo', target: `${s.name} (${s.lng}, ${s.lat})`, params: { id: s.id, lng: s.lng, lat: s.lat }, source: '面板' });
    showToast('已写入场景动作日志');
  };

  // 水源点击 → 地图 flyTo 定位
  const writeWaterLinkage = (w: WaterSource) => {
    addSceneAction({ action: 'flyTo', target: `${w.name} (${w.lng}, ${w.lat})`, params: { id: w.id, lng: w.lng, lat: w.lat }, source: '面板' });
    showToast('已定位到水源');
  };

  // 重点单位点击 → 地图 flyTo 定位
  const writeKeyUnitLinkage = (u: KeyUnit) => {
    addSceneAction({ action: 'flyTo', target: `${u.name} (${u.lng}, ${u.lat})`, params: { id: u.id, lng: u.lng, lat: u.lat }, source: '面板' });
    showToast('已定位到重点单位');
  };

  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id;

  // 当前 Tab 的统计卡片
  const currentStats = useMemo(() => {
    if (tab === 'force') {
      return [
        { icon: Flag, label: '队站数', value: stats[0]?.value ?? 0 },
        { icon: Users, label: '人员数', value: stats[1]?.value ?? 0 },
        { icon: Truck, label: '车辆数', value: stats[2]?.value ?? 0 },
        { icon: Package, label: '装备数', value: stats[3]?.value ?? 0 },
      ];
    }
    if (tab === 'water') {
      return [
        { icon: Droplet, label: '水源总数', value: waterStats?.total ?? 0 },
      ];
    }
    if (tab === 'keyunit') {
      return [
        { icon: Building2, label: '重点单位', value: filteredKeyUnits.length },
      ];
    }
    return [];
  }, [tab, stats, waterStats, filteredKeyUnits]);

  // 当前 Tab 的左侧树
  const currentTree = useMemo(() => {
    if (tab === 'force') return tree;
    if (tab === 'water') {
      const districtStats = waterStats?.by_district ?? [];
      return [{
        category: '区县',
        children: districtStats.map((d) => ({
          name: DISTRICT_NAME[d.district_code] ?? '未知',
          count: d.count,
        })),
      }];
    }
    if (tab === 'keyunit') {
      const typeMap = new Map<string, number>();
      for (const u of filteredKeyUnits) {
        typeMap.set(u.unitType, (typeMap.get(u.unitType) ?? 0) + 1);
      }
      return [{
        category: '类型',
        children: [...typeMap.entries()].map(([name, count]) => ({ name, count })),
      }];
    }
    return [];
  }, [tab, tree, waterStats, filteredKeyUnits]);

  return (
    <div className="flex h-full flex-col">
      {/* Tab 切换 */}
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setTreeSel(null); setVisible(20); setWaterPage(1); lastWaterKeyRef.current = ''; }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                active ? 'bg-cyan/15 text-cyan' : 'text-text-2 hover:bg-white/5 hover:text-text-1'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
        {/* 区域过滤指示器 */}
        {districtFilter && (
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-cyan/10 px-2.5 py-1 text-[11px] text-cyan">
            <MapPin className="h-3 w-3" />
            {DISTRICT_NAME[districtFilter] ?? '未知区域'}
            <button
              onClick={() => setDistrictFilter(null)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-cyan/20"
              title="清除过滤"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* 工具行 */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(20); }}
            placeholder={tab === 'force' ? '搜索队站 / 人员 / 车辆 / 装备…' : tab === 'water' ? '搜索水源名称 / 地址…' : '搜索重点单位…'}
            className="h-8 w-full rounded-md border border-line bg-bg-panel-2 pl-7 pr-2 text-[13px] text-text-1 placeholder:text-text-3 focus:border-line-glow focus:outline-none"
          />
        </div>
      </div>

      {state !== 'ok' && tab === 'force' ? (
        <PanelStateView state={state} onRetry={() => loadForce('ok')} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 统计卡片 */}
          <div className={`grid gap-2 p-3 ${tab === 'force' ? 'grid-cols-4' : 'grid-cols-1'}`}>
            {currentStats.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.08 }}
              >
                <StatCard icon={c.icon} label={c.label} value={c.value} />
              </motion.div>
            ))}
          </div>

          {/* 树 + 清单 */}
          <div className="flex min-h-0 flex-1 border-t border-line">
            {/* 分类树 */}
            <div className="w-[140px] shrink-0 overflow-y-auto border-r border-line py-1">
              {currentTree.map((group) => {
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
                        const isStationRow = tab === 'force' && group.category === '队站';
                        const isWaterDistrictRow = tab === 'water' && group.category === '区县';
                        const isKeyUnitTypeRow = tab === 'keyunit' && group.category === '类型';
                        const hasEye = isStationRow || isWaterDistrictRow || isKeyUnitTypeRow;
                        const hiddenOnMap = isStationRow
                          ? !layerPrefs.visibleStationTypes.includes(ch.name)
                          : isWaterDistrictRow
                            ? layerPrefs.hiddenWaterDistricts.includes(
                                Object.entries(DISTRICT_NAME).find(([, name]) => name === ch.name)?.[0] ?? '',
                              )
                            : isKeyUnitTypeRow
                              ? layerPrefs.hiddenKeyUnitTypes.includes(ch.name)
                              : false;
                        return (
                          <div key={ch.name} className="relative flex items-center">
                            <button
                              onClick={() => { setTreeSel(sel ? { category: group.category } : { category: group.category, subtype: ch.name }); setVisible(20); }}
                              className={`relative flex min-w-0 flex-1 items-center justify-between py-1.5 pl-7 pr-1 text-[12px] transition-colors hover:bg-bg-panel-2 ${
                                sel ? 'text-cyan' : 'text-text-2'
                              }`}
                            >
                              {sel && <span className="absolute left-0 top-0 h-full w-[2px] bg-cyan" />}
                              <span className={`truncate ${hiddenOnMap ? 'line-through opacity-50' : ''}`}>{ch.name}</span>
                              <span className="font-num text-text-3">{ch.count.toLocaleString()}</span>
                            </button>
                            {hasEye && (
                              <button
                                onClick={() => {
                                  if (isStationRow) toggleStationTypeVisible(ch.name);
                                  else if (isWaterDistrictRow) {
                                    const code = Object.entries(DISTRICT_NAME).find(([, name]) => name === ch.name)?.[0] ?? '';
                                    if (code) toggleWaterDistrictHidden(code);
                                  } else if (isKeyUnitTypeRow) toggleKeyUnitTypeHidden(ch.name);
                                }}
                                title={hiddenOnMap ? '在地图上显示' : '在地图上隐藏'}
                                className={`shrink-0 px-1.5 py-1.5 transition ${hiddenOnMap ? 'text-text-3' : 'text-cyan hover:text-cyan/70'}`}
                              >
                                {hiddenOnMap ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
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
                      const key = r.kind === 'station' ? r.station.id : r.kind === 'resource' ? r.item.id : r.kind === 'water' ? r.water.id : r.unit.id;
                      const name = r.kind === 'station' ? r.station.name : r.kind === 'resource' ? r.item.name : r.kind === 'water' ? r.water.name : r.unit.name;
                      const sub = r.kind === 'station' ? `${r.station.type} · 在位 ${r.station.personnel} 人`
                        : r.kind === 'resource' ? `${r.item.subtype} · ${stationName(r.item.stationId)}`
                        : r.kind === 'water' ? `${r.water.district} · ${r.water.type}`
                        : `${r.unit.unitType} · ${r.unit.address ?? ''}`;
                      const rawStatus = r.kind === 'station' ? '在位' : r.kind === 'resource' ? r.item.status : r.kind === 'water' ? r.water.status : r.unit.status;
                      const status = localizeStatus(tab, rawStatus);
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
                            } else if (r.kind === 'water') {
                              writeWaterLinkage(r.water);
                            } else if (r.kind === 'keyunit') {
                              writeKeyUnitLinkage(r.unit);
                            }
                          }}
                          className={`group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-bg-panel-2`}
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
                      已加载全部 {rows.length} 条
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
