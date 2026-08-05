// 实战指挥 · 战术推演层（纯 SVG/CSS 叠加层，SVG 线性投影，南京演示区）。
// TODO: 现底层已换真实 Leaflet 地图(EPSG:3857 Web Mercator)，本层线性投影不跟随 pan/zoom 且纬度方向有
// ~15-18% 拉伸，与真实底图不对齐；后续需 port 到 Leaflet layers(L.latLng → map.latLngToContainerPoint)。
// 三个图层：火势蔓延圈（阶段≥到场）/ 力量部署标注（推荐卡被采纳）/ 进攻路线（最近 2 队站→警情点）。
// 所有场景日志写入均去重：同一警情同一阶段只写一次 drawZone/drawRoute，clearTactical 每次换警情/熄灭一次。
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Truck, Users, Flame } from 'lucide-react';
import type { Incident, IncidentStatus, Recommendation } from '@/mock/incidents';
import { STATUS_ORDER } from '@/mock/incidents';
import type { LiveVars } from '@/mock/liveChannel';
import { computeNearbyStations } from '@/mock/geo';
import type { NearbyStation } from '@/mock/geo';
import { STATIONS } from '@/mock/stations';
import { GIS_BUILDINGS } from '@/mock/geo';
import { addSceneAction } from '@/mock/sceneLog';
import DemoTag from '@/components/DemoTag';

/** 经纬度 → SVG 坐标线性投影（南京演示区） */
const LNG_MIN = 118.73, LNG_MAX = 118.85;
const LAT_MIN = 32.02, LAT_MAX = 32.11;
const W = 1000, H = 700, PAD = 92;
function project(lng: number, lat: number) {
  const x = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (W - PAD * 2);
  const y = H - PAD - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (H - PAD * 2);
  return { x, y };
}

/** 警情简称：优先命中 GIS 建筑名（金茂大厦等），否则取地址末段 */
function shortName(incident: Incident): string {
  const hit = GIS_BUILDINGS.find((b) => incident.address.includes(b.name));
  if (hit) return hit.name;
  return incident.address.slice(-8);
}

/** 阶段是否 ≥ 到场 */
function arrived(status: IncidentStatus): boolean {
  return STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf('到场');
}

/** 蔓延圈基础半径（SVG 单位）：火势等级 + 温度越阈 + 阶段推进，确定性计算 */
function zoneRadii(incident: Incident, vars: LiveVars | null, growTick: number) {
  const stage = STATUS_ORDER.indexOf(incident.status) - STATUS_ORDER.indexOf('到场'); // 到场0/控制1
  const fire = vars?.fireLevel ?? 3;
  const heat = vars && vars.temperature > 500 ? 1.15 : 1; // 温度越阈放大 15%
  // 每 4s 一档缓慢扩大（growTick 每档 +2%），上限 +24%
  const grow = 1 + Math.min(growTick, 12) * 0.02;
  const base = (34 + fire * 9 + stage * 10) * heat * grow;
  return { burned: base, danger: base * 1.65, caution: base * 2.4 };
}

export default function TacticalOverlay({
  incident,
  vars,
  recommendations,
}: {
  incident: Incident | null;
  vars: LiveVars | null;
  recommendations: Recommendation[];
}) {
  // 蔓延圈呼吸/扩大档位：每 4s 一档
  const [growTick, setGrowTick] = useState(0);
  useEffect(() => {
    if (!incident || !arrived(incident.status)) return;
    const t = window.setInterval(() => setGrowTick((n) => n + 1), 4000);
    return () => window.clearInterval(t);
  }, [incident?.id, incident?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setGrowTick(0), [incident?.id]);

  const active = incident != null && arrived(incident.status) && incident.status !== '熄灭';

  // 最近 2 个队站（确定性，建筑坐标用警情坐标）
  const attackStations = useMemo<NearbyStation[]>(() => {
    if (!incident || !active) return [];
    return computeNearbyStations(
      { id: incident.id, name: shortName(incident), category: '高层建筑', address: incident.address, lng: incident.lng, lat: incident.lat },
      2,
    );
  }, [incident, active]);

  // 已采纳推荐 → 力量部署（按采纳序号环形分布；队站名优先从推荐内容匹配 STATIONS）
  const deployments = useMemo(() => {
    if (!incident || !active) return [];
    const adopted = recommendations
      .filter((r) => r.incidentId === incident.id && r.adopted && !r.ignored)
      .slice()
      .reverse(); // 推荐流新卡在数组头部，反转为采纳时间序
    return adopted.map((rec, i) => {
      const hit = STATIONS.find((s) => rec.content.includes(s.name));
      const fallback = attackStations[i % Math.max(1, attackStations.length)];
      const name = hit?.name ?? fallback?.name ?? `第 ${i + 1} 作战分队`;
      const n = adopted.length;
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
      const ring = 108;
      const c = project(incident.lng, incident.lat);
      return {
        recId: rec.id,
        name,
        kind: rec.type === 'force' ? 'truck' as const : 'crew' as const,
        x: c.x + Math.cos(angle) * ring,
        y: c.y + Math.sin(angle) * ring,
      };
    });
  }, [incident, active, recommendations, attackStations]);

  // ---- 场景日志（全部去重）----
  const loggedRef = useRef<Set<string>>(new Set());
  const clearedRef = useRef<string | null>(null);
  const logOnce = (key: string, fn: () => void) => {
    if (loggedRef.current.has(key)) return;
    loggedRef.current.add(key);
    fn();
  };

  // drawZone / drawRoute：同一警情同一阶段只写一次
  useEffect(() => {
    if (!incident || !active) return;
    const short = shortName(incident);
    logOnce(`drawZone:${incident.id}:${incident.status}`, () => {
      addSceneAction({
        action: 'drawZone',
        target: `蔓延圈层 · ${short}（${incident.status}）`,
        params: { incidentId: incident.id, status: incident.status },
        source: '预案引擎',
      });
    });
    for (const st of attackStations) {
      logOnce(`drawRoute:${incident.id}:${incident.status}:${st.stationId}`, () => {
        addSceneAction({
          action: 'drawRoute',
          target: `进攻路线 · ${st.name}→${short}`,
          params: { incidentId: incident.id, stationId: st.stationId, distanceKm: st.distanceKm },
          source: '预案引擎',
        });
      });
    }
  }, [incident, active, attackStations]);

  // 力量部署标注日志：每条采纳推荐只写一次
  useEffect(() => {
    if (!incident || !active) return;
    for (const d of deployments) {
      logOnce(`deploy:${incident.id}:${d.recId}`, () => {
        addSceneAction({
          action: 'addMarker',
          target: `力量部署 · ${d.name}`,
          params: { incidentId: incident.id, recId: d.recId },
          source: '面板',
        });
      });
    }
  }, [incident, active, deployments]);

  // clearTactical：换警情 / 熄灭时各写一次（按「旧警情 id + 原因」去重）
  const prevRef = useRef<{ id: string; status: IncidentStatus } | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = incident ? { id: incident.id, status: incident.status } : null;
    if (!prev) return;
    const switched = !incident || incident.id !== prev.id;
    const extinguished = incident?.id === prev.id && incident.status === '熄灭' && prev.status !== '熄灭';
    if ((!switched && !extinguished) || clearedRef.current === prev.id) return;
    clearedRef.current = prev.id;
    addSceneAction({
      action: 'clearTactical',
      target: `战术推演图层清除 · ${prev.id}${extinguished ? '（熄灭）' : '（切换警情）'}`,
      params: { incidentId: prev.id, reason: extinguished ? '熄灭' : '切换警情' },
      source: '预案引擎',
    });
  }, [incident]);

  const center = incident ? project(incident.lng, incident.lat) : null;
  const radii = incident && vars !== undefined ? zoneRadii(incident, vars, growTick) : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <AnimatePresence>
          {active && incident && center && radii && (
            <motion.g key={`zone-${incident.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* 警戒区（外圈 orange 虚线，呼吸） */}
              <motion.circle
                cx={center.x} cy={center.y} r={radii.caution}
                fill="none" stroke="#f97316" strokeWidth="1.5" strokeDasharray="8 6" opacity="0.55"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: `${center.x}px ${center.y}px` }}
              />
              {/* 蔓延危险区（中圈 orange 低透明填充 + 缓慢扩大档位过渡） */}
              <motion.circle
                cx={center.x} cy={center.y}
                fill="#f97316" fillOpacity="0.10" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7"
                animate={{ r: radii.danger }}
                transition={{ duration: 2.5, ease: 'easeInOut' }}
                style={{ filter: 'drop-shadow(0 0 8px rgba(249,115,22,.35))' }}
              />
              {/* 过火区（内圈 red 实填充低透明） */}
              <motion.circle
                cx={center.x} cy={center.y}
                fill="#ef4444" fillOpacity="0.22" stroke="#ef4444" strokeWidth="2"
                animate={{ r: radii.burned }}
                transition={{ duration: 2.5, ease: 'easeInOut' }}
                style={{ filter: 'drop-shadow(0 0 10px rgba(239,68,68,.5))' }}
              />
              {/* 中心火点脉冲 */}
              <motion.circle
                cx={center.x} cy={center.y} r="7"
                fill="#ef4444"
                animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                style={{ transformOrigin: `${center.x}px ${center.y}px` }}
              />
            </motion.g>
          )}
        </AnimatePresence>

        {/* 进攻路线：最近 2 队站 → 警情点（cyan 虚线 dash 流动） */}
        {active && incident && center && attackStations.map((st) => {
          const p = project(st.lng, st.lat);
          const mx = (p.x + center.x) / 2, my = (p.y + center.y) / 2;
          const bx = mx + (center.y - p.y) * 0.12, by = my - (center.x - p.x) * 0.12;
          return (
            <g key={`route-${incident.id}-${st.stationId}`}>
              <motion.polyline
                points={`${p.x},${p.y} ${bx},${by} ${center.x},${center.y}`}
                fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.9, strokeDashoffset: [20, 0] }}
                transition={{
                  opacity: { duration: 0.4 },
                  strokeDashoffset: { duration: 1.2, repeat: Infinity, ease: 'linear' },
                }}
                style={{ filter: 'drop-shadow(0 0 5px #22d3ee)' }}
              />
              <text
                x={bx} y={by - 6} textAnchor="middle" fill="#22d3ee" fontSize="11"
                stroke="#070e18" strokeWidth="3" style={{ paintOrder: 'stroke' }}
              >
                {st.name} 进攻路线
              </text>
            </g>
          );
        })}

        {/* 力量部署标注：采纳序号环形分布（Truck/Users + 队站名） */}
        {active && deployments.map((d) => (
          <motion.g
            key={d.recId}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            style={{ transformOrigin: `${d.x}px ${d.y}px` }}
          >
            <circle cx={d.x} cy={d.y} r="13" fill="#0a1420" stroke="#22d3ee" strokeWidth="1.2" opacity="0.95" />
            {d.kind === 'truck' ? (
              <Truck x={d.x - 8} y={d.y - 8} size={16} color="#22d3ee" />
            ) : (
              <Users x={d.x - 8} y={d.y - 8} size={16} color="#34d399" />
            )}
            <text
              x={d.x} y={d.y + 26} textAnchor="middle" fill="#9db4c8" fontSize="11" fontWeight={600}
              stroke="#070e18" strokeWidth="3" style={{ paintOrder: 'stroke' }}
            >
              {d.name}
            </text>
          </motion.g>
        ))}
      </svg>

      {/* 顶部中央：态势推演状态条 / 图例（演示数据 + 当前阶段 + 圈层图例） */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-line bg-bg-panel/90 px-3 py-1.5 backdrop-blur-[8px]">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-1">
            <Flame className="h-3.5 w-3.5 text-orange" />
            态势推演
          </span>
          <DemoTag />
          {active && incident ? (
            <>
              <span className="text-[11px] text-cyan">{incident.id} · 当前阶段：{incident.status}</span>
              <span className="h-3 w-px bg-line" />
              <span className="flex items-center gap-1 text-[11px] text-text-2">
                <span className="h-2 w-2 rounded-full bg-red/80" /> 过火区
              </span>
              <span className="flex items-center gap-1 text-[11px] text-text-2">
                <span className="h-2 w-2 rounded-full bg-orange/70" /> 蔓延危险区
              </span>
              <span className="flex items-center gap-1 text-[11px] text-text-2">
                <span className="h-2 w-2 rounded-full border border-dashed border-orange" /> 警戒区
              </span>
              <span className="flex items-center gap-1 text-[11px] text-text-2">
                <span className="inline-block h-0 w-3 border-t-2 border-dashed border-cyan" /> 进攻路线
              </span>
            </>
          ) : (
            <span className="text-[11px] text-text-3">
              {incident ? `${incident.id} · ${incident.status}（到场后生成推演图层）` : '选择警情后生成推演图层'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
