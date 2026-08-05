import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Minus, Plus, MapPin } from 'lucide-react';
import type { Station } from '@/mock/types';
import { STATIONS } from '@/mock/stations';
import { GIS_BUILDINGS } from '@/mock/geo';
import type { GisBuilding } from '@/mock/geo';
import { addSceneAction, subscribeSceneLog } from '@/mock/sceneLog';
import DemoTag from './DemoTag';
import BuildingInfoWindow from './gis/BuildingInfoWindow';
import { SceneInfoCard, SceneLogPanel } from './SceneOverlays';

/** 队站类型配色 */
const TYPE_COLORS: Record<Station['type'], string> = {
  救援大队: '#f97316',
  救援站: '#22d3ee',
  政府专职站: '#3b82f6',
  企业专职站: '#a78bfa',
  微型消防站: '#34d399',
};

/** 经纬度 → SVG 坐标投影（演示用线性投影，接入平台后由 GIS SDK 接管） */
const LNG_MIN = 118.73, LNG_MAX = 118.85;
const LAT_MIN = 32.02, LAT_MAX = 32.11;
const W = 1000, H = 700, PAD = 92;
function project(lng: number, lat: number) {
  const x = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (W - PAD * 2);
  const y = H - PAD - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (H - PAD * 2);
  return { x, y };
}

interface RouteLine {
  id: number;
  kind: 'attack' | 'evacuate' | 'arrival';
  points: string;
  etaMin?: number;
  /** 到场路线（cyan 虚线）不自动消失，等 hideRoute */
  persist?: boolean;
}
let routeSeq = 0;

export default function GisMapPlaceholder() {
  const [focusName, setFocusName] = useState<string | null>(null);
  const [selected, setSelected] = useState<Station | null>(null);
  const [buildingSel, setBuildingSel] = useState<{
    b: GisBuilding;
    anchor: { x: number; y: number; maxX: number };
  } | null>(null);
  const [routes, setRoutes] = useState<RouteLine[]>([]);
  const [etaBubble, setEtaBubble] = useState<{ id: number; x: number; y: number; label: string } | null>(null);
  const [waterPulse, setWaterPulse] = useState<{ id: number; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(13);
  const timers = useRef<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeSceneLog((_list, latest) => {
      if (!latest) return;
      if (latest.action === 'flyTo' || latest.action === 'addMarker') {
        const hit = STATIONS.find((s) => latest.target.includes(s.name));
        if (hit) {
          setFocusName(hit.name);
          setSelected(hit);
          timers.current.push(window.setTimeout(() => setFocusName(null), 3200));
        }
      }
      if (latest.action === 'highlight' && latest.params?.kind === 'water') {
        // 周边水源点击 → 占位区脉冲点反馈
        const lng = Number(latest.params.lng), lat = Number(latest.params.lat);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          const p = project(lng, lat);
          const id = ++routeSeq;
          setWaterPulse({ id, x: p.x, y: p.y });
          timers.current.push(window.setTimeout(() => {
            setWaterPulse((w) => (w?.id === id ? null : w));
          }, 2500));
        }
      }
      if (latest.action === 'showRoute') {
        routeSeq += 1;
        const kindParam = latest.params?.kind;
        if (kindParam === 'arrival' && latest.params?.from && latest.params?.to) {
          // 到场路线预览：cyan 虚线（dash 6-4），区别于进攻/疏散路线
          const f = latest.params.from as { lng: number; lat: number };
          const t = latest.params.to as { lng: number; lat: number };
          const p1 = project(f.lng, f.lat);
          const p2 = project(t.lng, t.lat);
          const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
          // 轻微弯折，模拟道路走向
          const bx = mx + (p2.y - p1.y) * 0.12, by = my - (p2.x - p1.x) * 0.12;
          const etaMin = Number(latest.params.etaMin);
          const line: RouteLine = {
            id: routeSeq, kind: 'arrival', persist: true,
            points: `${p1.x},${p1.y} ${bx},${by} ${p2.x},${p2.y}`,
            etaMin: Number.isFinite(etaMin) ? etaMin : undefined,
          };
          setRoutes((r) => [...r.filter((x) => x.kind !== 'arrival'), line]);
          if (line.etaMin != null) {
            const bubble = { id: line.id, x: p2.x, y: p2.y, label: `预计 ${line.etaMin} 分钟` };
            setEtaBubble(bubble);
            timers.current.push(window.setTimeout(() => {
              setEtaBubble((e) => (e?.id === bubble.id ? null : e));
            }, 2000));
          }
        } else {
          const kind = kindParam === 'evacuate' ? 'evacuate' : 'attack';
          const line: RouteLine = {
            id: routeSeq, kind,
            points: kind === 'attack'
              ? '120,560 300,470 470,420 620,330'
              : '620,340 500,430 330,470 160,430',
          };
          setRoutes((r) => [...r, line]);
          timers.current.push(window.setTimeout(() => {
            setRoutes((r) => r.filter((x) => x.id !== line.id));
          }, 6000));
        }
      }
      if (latest.action === 'hideRoute') { setRoutes([]); setEtaBubble(null); }
      if (latest.action === 'resetView') { setRoutes([]); setEtaBubble(null); setFocusName(null); setSelected(null); setBuildingSel(null); }
      if (latest.action === 'removeMarker') { setFocusName(null); setSelected(null); }
    });
    return () => { unsub(); timers.current.forEach(clearTimeout); };
  }, []);

  const markers = useMemo(
    () => STATIONS.map((s) => ({ s, ...project(s.lng, s.lat) })),
    [],
  );

  const handleMarkerClick = (s: Station) => {
    setSelected(s);
    addSceneAction({
      action: 'flyTo',
      target: s.name,
      params: { lng: s.lng, lat: s.lat },
      source: '面板',
    });
  };

  const buildingMarkers = useMemo(
    () => GIS_BUILDINGS.map((b) => ({ b, ...project(b.lng, b.lat) })),
    [],
  );

  const handleBuildingClick = (b: GisBuilding, e: React.MouseEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 240;
    const y = rect ? e.clientY - rect.top : 200;
    setBuildingSel({ b, anchor: { x, y, maxX: rect?.width ?? 1200 } });
    addSceneAction({
      action: 'flyTo',
      target: b.name,
      params: { lng: b.lng, lat: b.lat },
      source: '面板',
    });
  };

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-bg-grid">
      {/* GIS 底图（占位，接入平台 GIS SDK 后替换） */}
      <svg
        className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
        onClick={(e) => {
          // 点击地图空白处关闭建筑信息窗（点在交互元素上时不触发）
          const tag = (e.target as Element).tagName;
          if (tag === 'svg' || (tag === 'rect' && (e.target as Element).getAttribute('data-bg') === '1')) {
            setBuildingSel(null);
          }
        }}
      >
        {/* 陆地块 */}
        <rect width={W} height={H} fill="#0a1523" data-bg="1" />
        {/* 城市街区网格 */}
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`v${i}`} x1={100 + i * 100} y1={0} x2={80 + i * 100} y2={H} stroke="#13283c" strokeWidth="1" />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={90 + i * 100} x2={W} y2={70 + i * 100} stroke="#13283c" strokeWidth="1" />
        ))}
        {/* 河流（北缘水系，避开队站打点密集区） */}
        <path d="M-20,40 C200,20 320,90 500,70 C680,50 780,120 1020,90 L1020,150 C800,180 680,120 510,140 C340,160 200,90 -20,110 Z"
          fill="#0d2a40" stroke="#1c4a68" strokeWidth="1.5" />
        <text x="430" y="105" fill="#2e6b8f" fontSize="13" letterSpacing="6">长 江（演 示 水 系）</text>
        {/* 主干路 */}
        <line x1={60} y1={400} x2={940} y2={380} stroke="#1c3a54" strokeWidth="6" />
        <line x1={60} y1={400} x2={940} y2={380} stroke="#2e6b8f" strokeWidth="1" strokeDasharray="10 8" />
        <line x1={300} y1={120} x2={340} y2={680} stroke="#1c3a54" strokeWidth="5" />
        <line x1={640} y1={100} x2={600} y2={680} stroke="#1c3a54" strokeWidth="5" />
        <text x="700" y="366" fill="#3a5a74" fontSize="11" opacity="0.7">中山大道（演示道路）</text>
        {/* 地块标注 */}
        <text x="130" y="150" fill="#3a5a74" fontSize="13" letterSpacing="3">玄武区</text>
        <text x="720" y="150" fill="#3a5a74" fontSize="13" letterSpacing="3">建邺区</text>
        <text x="150" y="620" fill="#3a5a74" fontSize="13" letterSpacing="3">鼓楼区</text>
        <text x="740" y="600" fill="#3a5a74" fontSize="13" letterSpacing="3">秦淮区</text>
        {/* 重点单位（建筑对象，菱形 cyan 描边，与队站圆形图标区分） */}
        {buildingMarkers.map(({ b, x, y }) => {
          const active = buildingSel?.b.id === b.id;
          return (
            <g
              key={b.id}
              transform={`translate(${x},${y})`}
              className="cursor-pointer"
              onClick={(e) => handleBuildingClick(b, e)}
            >
              <motion.path
                d="M0,-10 L8,0 L0,10 L-8,0 Z"
                fill="#122c42"
                stroke="#22d3ee"
                strokeWidth={active ? 2.5 : 1.5}
                animate={active ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{ filter: `drop-shadow(0 0 ${active ? 8 : 3}px #22d3ee)`, transformOrigin: '0 0' }}
              />
              <circle r="2" fill="#22d3ee" />
              <text
                y="24" textAnchor="middle" fill={active ? '#22d3ee' : '#9db4c8'} fontSize="12"
                fontWeight={active ? 700 : 400}
                stroke="#070e18" strokeWidth="3" style={{ paintOrder: 'stroke' }}
              >
                {b.name}
              </text>
            </g>
          );
        })}

        {/* 路线（预案/智能体联动 + 到场路线预览） */}
        {routes.map((r) =>
          r.kind === 'arrival' ? (
            <motion.polyline
              key={r.id}
              points={r.points}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="6 4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, strokeDashoffset: [20, 0] }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 0.3 },
                strokeDashoffset: { duration: 1.2, repeat: Infinity, ease: 'linear' },
              }}
              style={{ filter: 'drop-shadow(0 0 5px #22d3ee)' }}
            />
          ) : (
            <motion.polyline
              key={r.id}
              points={r.points}
              fill="none"
              stroke={r.kind === 'attack' ? '#22d3ee' : '#34d399'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="600"
              initial={{ strokeDashoffset: 600, opacity: 1 }}
              animate={{ strokeDashoffset: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4 }}
              style={{ filter: `drop-shadow(0 0 5px ${r.kind === 'attack' ? '#22d3ee' : '#34d399'})` }}
            />
          ),
        )}

        {/* 到场 ETA 小气泡（2s） */}
        {etaBubble && (
          <motion.g
            key={etaBubble.id}
            transform={`translate(${etaBubble.x},${etaBubble.y - 26})`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <rect x="-44" y="-14" width="88" height="22" rx="11" fill="#0a1420" stroke="#22d3ee" strokeWidth="1" />
            <text textAnchor="middle" y="2" fill="#22d3ee" fontSize="12" fontFamily="JetBrains Mono, monospace">
              {etaBubble.label}
            </text>
          </motion.g>
        )}

        {/* 水源高亮脉冲点 */}
        {waterPulse && (
          <motion.g key={waterPulse.id} transform={`translate(${waterPulse.x},${waterPulse.y})`}>
            <motion.circle
              r="6" fill="#34d399" fillOpacity="0.35" stroke="#34d399" strokeWidth="2"
              initial={{ scale: 0.5, opacity: 1 }}
              animate={{ scale: [1, 1.8, 1], opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.2, repeat: 1 }}
            />
            <circle r="3" fill="#34d399" />
          </motion.g>
        )}

        {/* 队站打点 */}
        {markers.map(({ s, x, y }) => {
          const c = TYPE_COLORS[s.type];
          const focused = focusName === s.name;
          return (
            <g key={s.id} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => handleMarkerClick(s)}>
              {focused && (
                <motion.circle
                  r="14" fill="none" stroke={c} strokeWidth="2"
                  initial={{ scale: 0.6, opacity: 0.9 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: 1.2, repeat: 2 }}
                />
              )}
              <motion.path
                d="M0,-14 C8,-14 12,-8 12,-2 C12,6 0,14 0,14 C0,14 -12,6 -12,-2 C-12,-8 -8,-14 0,-14 Z"
                fill={c}
                fillOpacity={focused ? 1 : 0.85}
                stroke="#070e18"
                strokeWidth="1.5"
                animate={focused ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{ filter: `drop-shadow(0 0 ${focused ? 8 : 3}px ${c})`, transformOrigin: '0 0' }}
              />
              <circle cy="-4" r="3.5" fill="#070e18" />
              <text
                y="28" textAnchor="middle" fill={focused ? c : '#9db4c8'} fontSize="12" fontWeight={focused ? 700 : 400}
                stroke="#070e18" strokeWidth="3" style={{ paintOrder: 'stroke' }}
              >
                {s.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 选中队站信息卡 */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-4 left-4 z-20 w-[280px] rounded-lg border border-line bg-bg-panel/92 p-3 backdrop-blur-[8px]"
            style={{ boxShadow: '0 0 0 1px rgba(34,211,238,.2), 0 0 24px rgba(34,211,238,.08)' }}
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" style={{ color: TYPE_COLORS[selected.type] }} />
              <span className="text-[14px] font-bold text-text-1">{selected.name}</span>
              <span className="rounded-full border px-1.5 text-[10px]" style={{ color: TYPE_COLORS[selected.type], borderColor: `${TYPE_COLORS[selected.type]}55` }}>
                {selected.type}
              </span>
              <button onClick={() => setSelected(null)} className="ml-auto rounded p-0.5 text-text-3 hover:bg-white/10 hover:text-text-1">×</button>
            </div>
            <div className="mt-2 space-y-1 text-[12px]">
              <div className="flex justify-between"><span className="text-text-3">联系人</span><span className="text-text-1">{selected.contact}</span></div>
              <div className="flex justify-between"><span className="text-text-3">值班电话</span><span className="font-mono text-cyan">{selected.dutyPhone}</span></div>
              <div className="flex justify-between"><span className="text-text-3">地址</span><span className="max-w-[170px] truncate text-text-1">{selected.address}</span></div>
              <div className="flex justify-between"><span className="text-text-3">经纬度</span><span className="font-mono text-text-2">{selected.lng}, {selected.lat}</span></div>
              <div className="flex justify-between"><span className="text-text-3">人员 / 车辆</span><span className="text-text-1">{selected.personnel} 人 · {selected.vehicles} 辆</span></div>
            </div>
            <DemoTag className="mt-2" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 建筑信息窗（联动补全：基本信息 / 最近队站 / 到场路线预览 / 周边水源） */}
      <AnimatePresence>
        {buildingSel && (
          <BuildingInfoWindow
            key={buildingSel.b.id}
            building={buildingSel.b}
            anchor={buildingSel.anchor}
            onClose={() => setBuildingSel(null)}
          />
        )}
      </AnimatePresence>

      {/* 底部中央：GIS 底座标识 + 横向图例条（避开左右面板） */}
      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-line bg-bg-panel/90 px-3 py-2 backdrop-blur-[8px]">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-1">
            <Layers className="h-3.5 w-3.5 text-cyan" /> GIS 地图底座
          </span>
          <DemoTag />
          <span className="text-[11px] text-text-3">平台 GIS SDK 接入区 · 演示底图</span>
          <span className="h-3 w-px bg-line" />
          {(Object.keys(TYPE_COLORS) as Station['type'][]).map((t) => (
            <span key={t} className="flex items-center gap-1 text-[11px] text-text-2">
              <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[t], boxShadow: `0 0 4px ${TYPE_COLORS[t]}` }} />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* 右下（日志左侧）：缩放控件（演示） */}
      <div className="absolute bottom-4 right-[376px] z-20 flex flex-col overflow-hidden rounded-md border border-line bg-bg-panel/90 backdrop-blur-[8px]">
        <button onClick={() => setZoom((z) => Math.min(18, z + 1))} className="p-1.5 text-text-2 hover:bg-white/10 hover:text-cyan" title="放大（演示）">
          <Plus className="h-4 w-4" />
        </button>
        <div className="border-t border-line px-1 py-0.5 text-center font-mono text-[10px] text-text-3">{zoom}</div>
        <button onClick={() => setZoom((z) => Math.max(3, z - 1))} className="border-t border-line p-1.5 text-text-2 hover:bg-white/10 hover:text-cyan" title="缩小（演示）">
          <Minus className="h-4 w-4" />
        </button>
      </div>

      {/* 右上：场景信息小卡 / 右下：场景动作日志（共享浮层） */}
      <SceneInfoCard />
      <SceneLogPanel />
    </div>
  );
}
