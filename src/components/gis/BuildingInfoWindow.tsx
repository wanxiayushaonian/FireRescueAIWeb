// GIS 建筑信息窗（模块一联动补全）：基本信息 / 最近队站 / 到场路线预览 / 周边水源
// 全部数据为演示数据；距离为球面距离确定性计算，ETA 为估算值。
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Droplets, Droplet, Waves, Trees, Plug, Route, Building2, Flame,
  type LucideIcon,
} from 'lucide-react';
import type { FetchState } from '@/mock/types';
import type { GisBuilding, NearbyStation, NearbyWaterSource } from '@/mock/geo';
import { fetchNearbyStations, fetchNearbyWaterSources } from '@/mock/geo';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';
import DemoTag from '@/components/DemoTag';
import ReadinessBadge from '@/components/panels/ReadinessBadge';
import StatusBadge, { statusVariantOf } from '@/components/StatusBadge';

const CATEGORY_COLOR: Record<GisBuilding['category'], string> = {
  高层建筑: '#22d3ee',
  综合体: '#3b82f6',
  酒店: '#a78bfa',
};

const WATER_ICON: Record<NearbyWaterSource['type'], { icon: LucideIcon; color: string }> = {
  市政消火栓: { icon: Droplet, color: '#22d3ee' },
  消防水池: { icon: Waves, color: '#3b82f6' },
  天然水源: { icon: Trees, color: '#34d399' },
  水泵接合器: { icon: Plug, color: '#a78bfa' },
};

const RANK = ['①', '②', '③'];

const sectionAnim = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, delay: 0.06 * i },
});

export default function BuildingInfoWindow({
  building,
  anchor,
  onClose,
}: {
  building: GisBuilding;
  /** 锚点（相对地图容器像素坐标），信息窗锚定 marker 上方；maxX 为容器宽（防溢出） */
  anchor: { x: number; y: number; maxX: number };
  onClose: () => void;
}) {
  const [state, setState] = useState<FetchState>('loading');
  const [stations, setStations] = useState<NearbyStation[]>([]);
  const [waters, setWaters] = useState<NearbyWaterSource[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [routeOn, setRouteOn] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const timers = useRef<number[]>([]);

  const load = (s: FetchState) => {
    setState('loading');
    setPickedId(null);
    setRouteOn(false);
    Promise.all([
      fetchNearbyStations(building.id, { state: s }),
      fetchNearbyWaterSources(building.id, 500, { state: s }),
    ])
      .then(([st, ws]) => {
        // 骨架脉冲至少 400ms，展示加载态
        timers.current.push(window.setTimeout(() => {
          setStations(st);
          setWaters(ws);
          setPickedId(st[0]?.stationId ?? null);
          setState(s === 'empty' ? 'empty' : 'ok');
        }, 400));
      })
      .catch(() => setState('error'));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load('ok'), [building.id]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const picked = stations.find((s) => s.stationId === pickedId) ?? null;

  const hideRoute = () => {
    if (routeOn) {
      addSceneAction({ action: 'hideRoute', target: '到场路线', source: '面板' });
      setRouteOn(false);
    }
  };

  const pickStation = (id: string) => {
    hideRoute(); // 切换队站 → hideRoute
    setPickedId(id);
  };

  const toggleRoute = () => {
    if (!picked) return;
    if (routeOn) {
      hideRoute();
      return;
    }
    setDrawing(true); // 路线绘制中… 0.8s
    timers.current.push(window.setTimeout(() => {
      setDrawing(false);
      setRouteOn(true);
      addSceneAction({
        action: 'showRoute',
        target: `到场路线：${picked.name}→${building.name}（cyan，虚线样式区别进攻路线）`,
        params: { kind: 'arrival', from: { lng: picked.lng, lat: picked.lat }, to: { lng: building.lng, lat: building.lat }, etaMin: picked.etaMin },
        source: '面板',
      });
      addSceneAction({
        action: 'flyTo',
        target: `路线中点 (${picked.routeMidpoint.lng}, ${picked.routeMidpoint.lat})`,
        params: { lng: picked.routeMidpoint.lng, lat: picked.routeMidpoint.lat },
        source: '面板',
      });
      showToast('已写入场景动作日志 · 演示数据');
    }, 800));
  };

  const openProfile = () => {
    // 切对象总览模块并打开 BuildingProfilePanel（由 App 监听接线）
    window.dispatchEvent(new CustomEvent('gis:open-building-profile', { detail: { buildingId: building.id } }));
    showToast('已跳转对象总览 · 演示数据');
  };

  const ignite = () => {
    // 切演练对抗并预填情景参数（由 App 监听接线）
    window.dispatchEvent(new CustomEvent('gis:ignite-building', { detail: { buildingId: building.id, buildingName: building.name } }));
    showToast('已带入演练情景 · 演示数据');
  };

  const close = () => {
    hideRoute(); // 关闭信息窗 → hideRoute
    onClose();
  };

  const catColor = CATEGORY_COLOR[building.category];

  return (
    <div
      className="absolute z-30 w-[360px]"
      style={{
        left: Math.min(Math.max(anchor.x, 190), Math.max(anchor.maxX - 190, 190)),
        top: Math.max(anchor.y - 14, 8),
        transform: 'translate(-50%, -100%)',
      }}
    >
    <motion.div
      key={building.id}
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.25 }}
      className="w-full overflow-hidden rounded-lg border border-line bg-bg-panel/92 backdrop-blur-[8px]"
      style={{ boxShadow: '0 0 0 1px rgba(34,211,238,.2), 0 0 24px rgba(34,211,238,.08)' }}
    >
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-cyan to-transparent" />
      <div className="space-y-3 p-3">
        {/* 1. 头部：基本信息 */}
        <motion.div {...sectionAnim(0)}>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" style={{ color: catColor }} />
            <span className="text-[15px] font-bold text-text-1">{building.name}</span>
            <span className="rounded-full border px-1.5 text-[10px]" style={{ color: catColor, borderColor: `${catColor}55` }}>
              {building.category}
            </span>
            <ReadinessBadge buildingName={building.name} />
            <DemoTag />
            <button onClick={close} className="ml-auto rounded p-0.5 text-text-3 hover:bg-white/10 hover:text-text-1">×</button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[12px]">
            <span className="text-text-2">{building.address}</span>
            <select
              value={state === 'loading' ? 'ok' : state}
              onChange={(e) => load(e.target.value as FetchState)}
              className="rounded border border-line bg-bg-panel-2 px-1 py-px text-[11px] text-text-3 outline-none"
              title="状态演示"
            >
              <option value="ok">状态演示：正常</option>
              <option value="empty">状态演示：空态</option>
              <option value="error">状态演示：失败</option>
            </select>
          </div>
        </motion.div>

        {state === 'loading' ? (
          <div className="space-y-2 py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-bg-panel-2" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <img src="/error-radar.svg" alt="" className="h-[72px] w-[96px] opacity-80" />
            <div className="text-[13px] text-text-2">联动数据加载失败</div>
            <button
              onClick={() => load('ok')}
              className="rounded-md border border-cyan/50 px-3 py-1 text-[12px] text-cyan transition hover:bg-cyan/10"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            {/* 2. 最近队站 */}
            <motion.section {...sectionAnim(1)}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-cyan" />
                <span className="text-[13px] font-bold text-text-1">最近队站</span>
                <span className="ml-auto text-[11px] text-text-3">按到场时间排序 · 演示数据</span>
              </div>
              {stations.length === 0 ? (
                <div className="rounded-md border border-dashed border-line px-3 py-2.5 text-center text-[12px] text-text-3">
                  暂无可用队站 · 演示数据
                </div>
              ) : (
                <div className="space-y-1">
                  {stations.map((s, i) => {
                    const active = s.stationId === pickedId;
                    return (
                      <button
                        key={s.stationId}
                        onClick={() => pickStation(s.stationId)}
                        className={`group flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                          active
                            ? 'border-cyan/60 bg-cyan/5 shadow-[0_0_8px_rgba(34,211,238,.15)]'
                            : 'border-transparent hover:bg-bg-panel-2 hover:shadow-[inset_2px_0_0_#22d3ee]'
                        }`}
                      >
                        <span className="font-num text-[15px] font-bold text-cyan">{RANK[i]}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-text-1">{s.name}</span>
                          <span className="block text-[11px] text-text-3">{s.type}</span>
                        </span>
                        <span className="ml-auto text-right">
                          <span className="block font-mono text-[13px] text-text-1">{s.distanceKm.toFixed(1)}km</span>
                          <span className="block text-[13px] text-cyan">约 {s.etaMin} 分钟</span>
                        </span>
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.available === '在位' ? 'bg-green' : 'bg-amber'}`}
                          title={s.available}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.section>

            {/* 3. 到场路线预览 */}
            {picked && (
              <motion.section {...sectionAnim(2)}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Route className="h-3.5 w-3.5 text-cyan" />
                  <span className="text-[13px] font-bold text-text-1">到场路线</span>
                  <span className="ml-auto text-[11px] text-text-3">估算值</span>
                </div>
                <div className="rounded-md bg-bg-panel-2 px-2 py-1.5">
                  <div className="text-[13px] text-text-1">{picked.name} → {building.name}</div>
                  <div className="mt-0.5 text-[12px] text-text-2">途经 {picked.routeSummary}</div>
                </div>
                <button
                  onClick={toggleRoute}
                  disabled={drawing}
                  className={`mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border text-[13px] transition ${
                    routeOn
                      ? 'border-cyan bg-cyan/15 text-cyan shadow-[0_0_10px_rgba(34,211,238,.3)]'
                      : 'border-cyan/50 text-cyan hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.3)]'
                  } ${drawing ? 'opacity-70' : ''}`}
                >
                  {drawing ? '路线绘制中…' : routeOn ? '取消路线预览' : '场景预览路线'}
                </button>
              </motion.section>
            )}

            {/* 4. 周边水源 */}
            <motion.section {...sectionAnim(3)}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Droplets className="h-3.5 w-3.5 text-green" />
                <span className="text-[13px] font-bold text-text-1">周边水源（500m）</span>
                <span className="ml-auto text-[11px] text-text-3">按距离排序 · 演示数据</span>
              </div>
              {waters.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-2.5">
                  <img src="/empty-box.svg" alt="" className="h-[54px] w-[72px] opacity-70" />
                  <div className="text-[12px] text-text-3">500m 内暂无水源数据 · 演示数据</div>
                </div>
              ) : (
                <div className="space-y-1">
                  {waters.map((w, i) => {
                    const { icon: Icon, color } = WATER_ICON[w.type];
                    return (
                      <motion.button
                        key={w.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: 0.04 * i }}
                        onClick={() =>
                          addSceneAction({
                            action: 'highlight',
                            target: w.name,
                            params: { lng: w.lng, lat: w.lat, kind: 'water' },
                            source: '面板',
                          })
                        }
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-bg-panel-2 hover:shadow-[inset_2px_0_0_#22d3ee]"
                      >
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${w.type === '天然水源' ? 'animate-pulse [animation-duration:2s] opacity-60' : ''}`}
                          style={{ color }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-text-1">{w.name}</span>
                          <span className="block text-[11px] text-text-3">{w.type} · {w.note}</span>
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          <StatusBadge label={w.status} variant={statusVariantOf(w.status)} pulse={w.status !== '正常'} />
                          <span className="w-[48px] text-right font-mono text-[13px] text-text-1">{w.distanceM}m</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </motion.section>
          </>
        )}

        {/* 底部工具条 */}
        <div className="flex gap-2 border-t border-line pt-2.5">
          <button
            onClick={openProfile}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-cyan/50 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.3)]"
          >
            <Building2 className="h-3.5 w-3.5" /> 查看建筑档案
          </button>
          <button
            onClick={ignite}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-orange/60 text-[13px] text-orange transition hover:bg-orange/10 hover:shadow-[0_0_10px_rgba(249,115,22,.3)]"
          >
            <Flame className="h-3.5 w-3.5" /> 设为着火建筑
          </button>
        </div>
      </div>
    </motion.div>
    </div>
  );
}
