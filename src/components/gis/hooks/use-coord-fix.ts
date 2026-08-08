'use client';
// 坐标修正(点位治理)hook:修正面板状态 + 地址查询/保存/批量补全。从 RealGisMap 抽取,行为不变。
// batching/batchMsg 仅 batchGeocode 内部使用(编排者不读),随 hook 内聚。
// setCoordFix 一并返回:use-entity-form 打开表单时需互清 coordFix(经 deps 注入,不合并两个 hook)。
import { useCallback, useState } from 'react';
import { fetchGeocode, type GeoCandidate } from '@/api/geocode';
import { fetchKeyUnits, updateKeyUnitCoords, geocodeMissingKeyUnits } from '@/api/key-units';
import { fetchKeyBuildings, updateKeyBuildingCoords } from '@/api/key-buildings';
import { addSceneAction } from '@/mock/sceneLog';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import type { KeyBuilding } from '@/lib/key-building-mapper';
import type { CoordFixTarget } from '../CoordinateFixPanel';

export function useCoordFix(deps: {
  setKeyUnits: React.Dispatch<React.SetStateAction<KeyUnit[]>>;
  setBuildings: React.Dispatch<React.SetStateAction<KeyBuilding[]>>;
}): {
  coordFix: CoordFixTarget | null;
  setCoordFix: React.Dispatch<React.SetStateAction<CoordFixTarget | null>>;
  draftCoord: { lng: number; lat: number } | null;
  setDraftCoord: React.Dispatch<React.SetStateAction<{ lng: number; lat: number } | null>>;
  pickMode: boolean;
  setPickMode: React.Dispatch<React.SetStateAction<boolean>>;
  geoCandidates: GeoCandidate[];
  setGeoCandidates: React.Dispatch<React.SetStateAction<GeoCandidate[]>>;
  geoQuerying: boolean;
  coordSaving: boolean;
  coordError: string | null;
  openCoordFix: (t: CoordFixTarget) => void;
  closeCoordFix: () => void;
  queryAddress: (address: string) => Promise<void>;
  saveCoord: () => Promise<void>;
  batchGeocode: () => Promise<void>;
} {
  const { setKeyUnits, setBuildings } = deps;

  const [coordFix, setCoordFix] = useState<CoordFixTarget | null>(null);
  const [draftCoord, setDraftCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [geoCandidates, setGeoCandidates] = useState<GeoCandidate[]>([]);
  const [geoQuerying, setGeoQuerying] = useState(false);
  const [coordSaving, setCoordSaving] = useState(false);
  const [coordError, setCoordError] = useState<string | null>(null);
  const [batching, setBatching] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);

  const openCoordFix = useCallback((t: CoordFixTarget) => {
    setCoordFix(t);
    setDraftCoord(null);
    setGeoCandidates([]);
    setCoordError(null);
    setPickMode(false);
  }, []);

  const closeCoordFix = useCallback(() => {
    setCoordFix(null);
    setDraftCoord(null);
    setGeoCandidates([]);
    setCoordError(null);
    setPickMode(false);
  }, []);

  const queryAddress = useCallback(async (address: string) => {
    setGeoQuerying(true);
    setCoordError(null);
    try {
      setGeoCandidates(await fetchGeocode(address));
    } catch {
      setGeoCandidates([]);
      setCoordError('地址查询失败');
    } finally {
      setGeoQuerying(false);
    }
  }, []);

  const saveCoord = useCallback(async () => {
    if (!coordFix || !draftCoord) return;
    setCoordSaving(true);
    setCoordError(null);
    try {
      if (coordFix.kind === 'unit') {
        await updateKeyUnitCoords(coordFix.id, draftCoord.lng, draftCoord.lat);
        setKeyUnits(await fetchKeyUnits());
      } else {
        await updateKeyBuildingCoords(coordFix.id, draftCoord.lng, draftCoord.lat);
        setBuildings(await fetchKeyBuildings());
      }
      addSceneAction({
        action: 'updateCoord',
        target: `坐标修正 · ${coordFix.name} → ${draftCoord.lng.toFixed(5)},${draftCoord.lat.toFixed(5)}`,
        params: { id: coordFix.id, lng: draftCoord.lng, lat: draftCoord.lat },
        source: '面板',
      });
      setCoordFix(null);
      setDraftCoord(null);
      setGeoCandidates([]);
    } catch {
      setCoordError('保存失败(网络或权限)');
    } finally {
      setCoordSaving(false);
    }
  }, [coordFix, draftCoord, setKeyUnits, setBuildings]);

  const batchGeocode = useCallback(async () => {
    setBatching(true);
    setBatchMsg(null);
    try {
      const n = await geocodeMissingKeyUnits();
      setKeyUnits(await fetchKeyUnits());
      setBatchMsg(`已补全 ${n} 个单位坐标`);
    } catch {
      setBatchMsg('批量补全失败');
    } finally {
      setBatching(false);
    }
  }, [setKeyUnits]);

  return {
    coordFix, setCoordFix,
    draftCoord, setDraftCoord,
    pickMode, setPickMode,
    geoCandidates, setGeoCandidates,
    geoQuerying, coordSaving, coordError,
    openCoordFix, closeCoordFix, queryAddress, saveCoord, batchGeocode,
  };
}
