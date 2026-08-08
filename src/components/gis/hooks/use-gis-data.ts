'use client';
// GIS 数据加载 hook:7 个数据 effect 从 RealGisMap 抽取(站/资源/水源视口/重点单位/警情/重点建筑/重点区域),行为不变。
// 水源为视口驱动(bbox + moveend 300ms 防抖 + seq 去重 + "数据集没变跳过 setState 保 popup"),hiddenWaterDistricts 由组件经参数传入。
import { useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import type { Station, WaterSource, ResourceItem } from '@/mock/types';
import { fetchStations, fetchResources } from '@/api/force';
import { fetchWaterSourcesInBbox, fetchWaterClusters, type WaterCluster } from '@/api/water';
import { fetchKeyUnits } from '@/api/key-units';
import { fetchIncidents } from '@/api/incidents';
import type { Incident } from '@/lib/incident-mapper';
import { fetchKeyBuildings } from '@/api/key-buildings';
import { fetchRegions } from '@/api/regions';
import { shouldShowWater, shouldShowWaterPoints, waterClusterCell } from '@/lib/map-icons';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import type { KeyBuilding } from '@/lib/key-building-mapper';
import type { Region } from '@/lib/region-mapper';

export function useGisData(deps: {
  mapRef: React.MutableRefObject<L.Map | null>;
  mapInited: boolean;
  hiddenWaterDistricts: string[]; // layerPrefs.hiddenWaterDistricts 传入
}): {
  stations: Station[]; stationsRef: React.MutableRefObject<Station[]>;
  resources: ResourceItem[];
  water: WaterSource[]; waterRef: React.MutableRefObject<WaterSource[]>;
  waterClusters: WaterCluster[];
  keyUnits: KeyUnit[]; setKeyUnits: React.Dispatch<React.SetStateAction<KeyUnit[]>>;
  incidents: Incident[];
  buildings: KeyBuilding[]; setBuildings: React.Dispatch<React.SetStateAction<KeyBuilding[]>>;
  regions: Region[]; setRegions: React.Dispatch<React.SetStateAction<Region[]>>;
  loadState: 'loading' | 'ok' | 'error';
  bumpWater: () => void; // 原 setWaterTick(t=>t+1),实体增删改后触发 bbox 重取
} {
  const { mapRef, mapInited, hiddenWaterDistricts } = deps;

  const stationsRef = useRef<Station[]>([]);
  const waterRef = useRef<WaterSource[]>([]);
  const waterClustersRef = useRef<WaterCluster[]>([]);

  const [stations, setStations] = useState<Station[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [water, setWater] = useState<WaterSource[]>([]);
  const [waterClusters, setWaterClusters] = useState<WaterCluster[]>([]);
  const [keyUnits, setKeyUnits] = useState<KeyUnit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [buildings, setBuildings] = useState<KeyBuilding[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  // 水源数据变更后 bump 触发 bbox/clusters 重取
  const [waterTick, setWaterTick] = useState(0);

  // 加载消防站
  useEffect(() => {
    let alive = true;
    fetchStations()
      .then((st) => {
        if (alive) {
          stationsRef.current = st;
          setStations(st);
          setLoadState('ok');
        }
      })
      .catch(() => {
        if (alive) setLoadState('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  // 加载执勤明细(用于聚合各站真实人员数,popup 动态显示)
  useEffect(() => {
    let alive = true;
    fetchResources()
      .then((rs) => {
        if (alive) setResources(rs);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 加载水源:视口驱动(bbox),moveend 防抖 300ms;按 zoom 分三级——
  // <13 不加载;13-14 网格聚合气泡(clusters 端点,一次请求);>=15 bbox 明细点位。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    let alive = true;
    let timer: number | undefined;
    let seq = 0;
    const load = () => {
      const zoom = map.getZoom();
      if (!shouldShowWater(zoom)) {
        waterRef.current = [];
        waterClustersRef.current = [];
        setWater([]);
        setWaterClusters([]);
        return;
      }
      const b = map.getBounds().pad(0.25); // 外扩,平移小距离不重复请求(地图与库同为 GCJ02,直接用)
      const bbox = {
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      };
      const mySeq = ++seq;
      if (shouldShowWaterPoints(zoom)) {
        fetchWaterSourcesInBbox(bbox)
          .then((ws) => {
            if (!alive || mySeq !== seq) return;
            // 数据集没变就跳过 setWater,避免触发重渲染把已打开的 popup 销毁
            const cur = waterRef.current;
            if (cur.length !== ws.length || !cur.every((c, i) => c.id === ws[i]?.id)) {
              waterRef.current = ws;
              setWater(ws);
            }
            if (waterClustersRef.current.length) {
              waterClustersRef.current = [];
              setWaterClusters([]);
            }
          })
          .catch(() => {});
      } else {
        fetchWaterClusters(bbox, waterClusterCell(zoom), hiddenWaterDistricts)
          .then((cs) => {
            if (!alive || mySeq !== seq) return;
            const cur = waterClustersRef.current;
            if (
              cur.length !== cs.length ||
              !cur.every((c, i) => c.lng === cs[i]?.lng && c.lat === cs[i]?.lat && c.count === cs[i]?.count)
            ) {
              waterClustersRef.current = cs;
              setWaterClusters(cs);
            }
            if (waterRef.current.length) {
              waterRef.current = [];
              setWater([]);
            }
          })
          .catch(() => {});
      }
    };
    const debounced = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 300);
    };
    load();
    map.on('moveend', debounced);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      map.off('moveend', debounced);
    };
  }, [mapInited, hiddenWaterDistricts, waterTick]);

  // 加载重点单位
  useEffect(() => {
    let alive = true;
    fetchKeyUnits()
      .then((ks) => {
        if (alive) setKeyUnits(ks);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 加载警情/事件
  useEffect(() => {
    let alive = true;
    fetchIncidents()
      .then((is) => {
        if (alive) setIncidents(is);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 加载重点建筑
  useEffect(() => {
    let alive = true;
    fetchKeyBuildings()
      .then((bs) => {
        if (alive) setBuildings(bs);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 加载重点区域
  useEffect(() => {
    let alive = true;
    fetchRegions()
      .then((rs) => {
        if (alive) setRegions(rs);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return {
    stations, stationsRef,
    resources,
    water, waterRef,
    waterClusters,
    keyUnits, setKeyUnits,
    incidents,
    buildings, setBuildings,
    regions, setRegions,
    loadState,
    bumpWater: () => setWaterTick((t) => t + 1),
  };
}
