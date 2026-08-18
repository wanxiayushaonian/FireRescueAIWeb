// 实战指挥 · 战术推演层（SVG 叠加层，经 Leaflet map.latLngToContainerPoint 投影，跟随 pan/zoom）。
// 2026-08-16 修复：原南京演示区线性投影不跟随地图且纬度方向拉伸 ~15-18%，已改为真实地图
// 像素投影；就近队站由 mock 南京站点改为 znya 九江真实站点（fetchStations，与底图同源）；
// 圈层半径改为米制并按 zoom 换算像素（EPSG:3857 分辨率公式）。
// 三个图层：火势蔓延圈（阶段≥到场）/ 力量部署标注（推荐卡被采纳）/ 进攻路线（最近 2 队站→警情点）。
// 所有场景日志写入均去重：同一警情同一阶段只写一次 drawZone/drawRoute，clearTactical 每次换警情/熄灭一次。
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { Truck, Users, Flame } from 'lucide-react';
import type { Incident, IncidentStatus, Recommendation } from '@/mock/incidents';
import { STATUS_ORDER } from '@/mock/incidents';
import type { LiveVars } from '@/mock/liveChannel';
import { fetchStations } from '@/api/force';
import { addSceneAction } from '@/mock/sceneLog';
import DemoTag from '@/components/DemoTag';

/** 就近队站(九江真实站点,坐标必有值) */
interface AttackStation {
  stationId: string;
  name: string;
  lng: number;
  lat: number;
  distanceKm: number;
}

/** 警情简称：取地址末段(匹配不到建筑名时的兜底) */
function shortName(incident: Incident): string {
  return incident.address.slice(-8);
}

/** 阶段是否 ≥ 到场 */
function arrived(status: IncidentStatus): boolean {
  return STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf('到场');
}

/** 城市尺度近似距离(km,equirect 投影) */
function distKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const dx = (a.lng - b.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180) * 111.32;
  const dy = (a.lat - b.lat) * 110.57;
  return Math.hypot(dx, dy);
}

/** EPSG:3857 每像素米数(256 瓦片) */
function metersPerPixel(map: L.Map, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();
}

/** 蔓延圈基础半径(米)：火势等级 + 温度越阈 + 阶段推进，确定性计算 */
function zoneRadiiMeters(incident: Incident, vars: LiveVars | null, growTick: number) {
  const stage = STATUS_ORDER.indexOf(incident.status) - STATUS_ORDER.indexOf('到场'); // 到场0/控制1
  const fire = vars?.fireLevel ?? 3;
  const heat = vars && vars.temperature > 500 ? 1.15 : 1; // 温度越阈放大 15%
  // 每 4s 一档缓慢扩大（growTick 每档 +2%），上限 +24%
  const grow = 1 + Math.min(growTick, 12) * 0.02;
  const base = (40 + fire * 15 + stage * 25) * heat * grow;
  return { burned: base, danger: base * 1.65, caution: base * 2.4 };
}

export default function TacticalOverlay({
  map,
  incident,
  vars,
  recommendations,
}: {
  /** 底图 Leaflet 实例(RealGisMap onMapReady 注入);未就绪时仅渲染状态条 */
  map: L.Map | null;
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

  // 地图移动/缩放/尺寸变化 → 重投影(rAF 合帧:平移时 move 事件逐帧连发,重算每帧最多一次)
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!map) return;
    let raf = 0;
    const bump = (): void => {
      if (raf) return; // 已排程,合并到本帧
      raf = requestAnimationFrame(() => {
        raf = 0;
        setVersion((v) => v + 1);
      });
    };
    map.on('move zoom resize', bump);
    bump();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      map.off('move zoom resize', bump);
    };
  }, [map]);

  // 九江真实站点(与底图同源;坐标缺失的跳过)
  const [stations, setStations] = useState<Array<{ id: string; name: string; lng: number; lat: number }>>([]);
  useEffect(() => {
    let alive = true;
    fetchStations()
      .then((rows) => {
        if (!alive) return;
        setStations(
          rows
            .filter((s) => s.lng != null && s.lat != null)
            .map((s) => ({ id: s.id, name: s.name, lng: s.lng as number, lat: s.lat as number })),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const active = incident != null && arrived(incident.status) && incident.status !== '熄灭';

  // 警情地理坐标(静态:不随地图平移失效——下游就近排序/半径 memo 依赖它,平移时零重算)
  const posGeo = useMemo(
    () => (incident ? { lng: incident.lng, lat: incident.lat } : null),
    [incident],
  );
  // 演示绘制位置:mock 警情远离底图(>0.5°)时以地图中心为演示位(按警情判定一次)
  const pos = useMemo(() => {
    if (!posGeo || !map) return null;
    const c = map.getCenter();
    const far = Math.abs(posGeo.lng - c.lng) > 0.5 || Math.abs(posGeo.lat - c.lat) > 0.5;
    return {
      lng: far ? c.lng + 0.004 : posGeo.lng,
      lat: far ? c.lat - 0.003 : posGeo.lat,
      demo: far,
    };
  }, [posGeo, map]);

  // 最近 2 个真实队站(确定性;依赖静态 posGeo,平移不重算)
  const attackStations = useMemo<AttackStation[]>(() => {
    if (!incident || !active || !posGeo) return [];
    return stations
      .map((s) => ({ stationId: s.id, name: s.name, lng: s.lng, lat: s.lat, distanceKm: distKm(s, posGeo) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 2);
  }, [incident, active, posGeo, stations]);

  // 像素投影(容器坐标系,SVG 与地图容器同尺寸)
  const size = map ? map.getSize() : { x: 0, y: 0 };
  const toPoint = (lng: number, lat: number): { x: number; y: number } => {
    const p = map!.latLngToContainerPoint([lat, lng]);
    return { x: p.x, y: p.y };
  };

  const center = pos && map ? toPoint(pos.lng, pos.lat) : null;
  // 圈层半径:米 → 像素;低缩放级别圈过小时整体放大到最小可见(过火区 ≥ 8px)
  const radii = useMemo(() => {
    if (!incident || !pos || !map || vars === undefined) return null;
    const m = zoneRadiiMeters(incident, vars, growTick);
    const mpp = metersPerPixel(map, pos.lat);
    let burned = m.burned / mpp;
    const danger = m.danger / mpp;
    const caution = m.caution / mpp;
    if (burned < 8) {
      const scale = 8 / burned;
      burned *= scale;
      return { burned, danger: danger * scale, caution: caution * scale };
    }
    return { burned, danger, caution };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident, pos, map, vars, growTick, version]);

  // 已采纳推荐 → 力量部署名称解析(静态:不依赖投影,平移零重算;位置在渲染时随 center 内联计算)
  const deployments = useMemo(() => {
    if (!incident || !active) return [];
    const adopted = recommendations
      .filter((r) => r.incidentId === incident.id && r.adopted && !r.ignored)
      .slice()
      .reverse(); // 推荐流新卡在数组头部，反转为采纳时间序
    return adopted.map((rec, i) => {
      const hit = stations.find((s) => rec.content.includes(s.name));
      const fallback = attackStations[i % Math.max(1, attackStations.length)];
      return {
        recId: rec.id,
        name: hit?.name ?? fallback?.name ?? `第 ${i + 1} 作战分队`,
        kind: rec.type === 'force' ? 'truck' as const : 'crew' as const,
        index: i,
        total: adopted.length,
      };
    });
  }, [incident, active, recommendations, attackStations, stations]);

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
          params: { incidentId: incident.id, stationId: st.stationId, distanceKm: Number(st.distanceKm.toFixed(1)) },
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

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {map && (
        <svg className="absolute inset-0 h-full w-full" width={size.x} height={size.y}>
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

          {/* 进攻路线：最近 2 队站 → 警情点（cyan 虚线 dash 流动；站/警情均按真实地图投影） */}
          {active && incident && center && attackStations.map((st) => {
            const p = toPoint(st.lng, st.lat);
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
          {active && center && deployments.map((d) => {
            // 环形分布位置随投影 center 内联计算(地图平移时跟随,零 memo 失效)
            const angle = -Math.PI / 2 + (d.index * 2 * Math.PI) / Math.max(1, d.total);
            const ring = 108;
            const x = center.x + Math.cos(angle) * ring;
            const y = center.y + Math.sin(angle) * ring;
            return (
              <motion.g
                key={d.recId}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                style={{ transformOrigin: `${x}px ${y}px` }}
              >
                <circle cx={x} cy={y} r="13" fill="#0a1420" stroke="#22d3ee" strokeWidth="1.2" opacity="0.95" />
                {d.kind === 'truck' ? (
                  <Truck x={x - 8} y={y - 8} size={16} color="#22d3ee" />
                ) : (
                  <Users x={x - 8} y={y - 8} size={16} color="#34d399" />
                )}
                <text
                  x={x} y={y + 26} textAnchor="middle" fill="#9db4c8" fontSize="11" fontWeight={600}
                  stroke="#070e18" strokeWidth="3" style={{ paintOrder: 'stroke' }}
                >
                  {d.name}
                </text>
              </motion.g>
            );
          })}
        </svg>
      )}

      {/* 顶部中央:态势推演状态条 / 图例(演示数据 + 当前阶段 + 圈层图例)。
          top-[110px]:让开 GIS 图层控制条(top-3)与模式切换条(top-[60px]) */}
      <div className="absolute left-1/2 top-[110px] -translate-x-1/2 rounded-lg border border-line bg-bg-panel/90 px-3 py-1.5 backdrop-blur-[8px]">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-1">
            <Flame className="h-3.5 w-3.5 text-orange" />
            态势推演
          </span>
          <DemoTag />
          {active && incident ? (
            <>
              <span className="text-[11px] text-cyan">{incident.id} · 当前阶段：{incident.status}</span>
              {pos?.demo && <span className="text-[11px] text-orange">坐标不在当前底图 · 已用演示位置</span>}
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
