'use client';
// 点位增删改表单 hook(水源/重点单位/重点建筑):表单状态 + 增删改 + 地图空白右键"新增点位"菜单。
// 从 RealGisMap 抽取,行为不变。与 coordFix 的交叉(geoCandidates/pickMode 共享、打开表单时互清 coordFix)
// 及圆环菜单联动(setRadial)经 deps 注入,不合并两个 hook。
import { useCallback, useEffect, useState } from 'react';
import type L from 'leaflet';
import type { WaterSource } from '@/mock/types';
import { createWaterSource, updateWaterSource, deleteWaterSource } from '@/api/water';
import { fetchKeyUnits, createKeyUnit, updateKeyUnit, deleteKeyUnit } from '@/api/key-units';
import { fetchKeyBuildings, fetchKeyBuildingDetail, createKeyBuilding, updateKeyBuilding, deleteKeyBuilding } from '@/api/key-buildings';
import type { GeoCandidate } from '@/api/geocode';
import { addSceneAction } from '@/mock/sceneLog';
import { emptyEntityForm, buildWaterPayload, buildUnitPayload, buildBuildingPayload, type EntityFormValues, type EntityKind } from '@/lib/entity-form';
import { showToast } from '@/components/Toast';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import type { KeyBuilding } from '@/lib/key-building-mapper';
import type { CoordFixTarget } from '../CoordinateFixPanel';

export interface EntityFormState {
  mode: 'create' | 'edit';
  id?: string;
  values: EntityFormValues;
}

export function useEntityForm(deps: {
  keyUnits: KeyUnit[];
  setKeyUnits: React.Dispatch<React.SetStateAction<KeyUnit[]>>;
  setBuildings: React.Dispatch<React.SetStateAction<KeyBuilding[]>>;
  waterRef: React.MutableRefObject<WaterSource[]>;
  bumpWater: () => void;
  mapRef: React.MutableRefObject<L.Map | null>;
  mapInited: boolean;
  setGeoCandidates: React.Dispatch<React.SetStateAction<GeoCandidate[]>>; // 与 use-coord-fix 共享
  setPickMode: React.Dispatch<React.SetStateAction<boolean>>; // 与 use-coord-fix 共享
  setCoordFix: React.Dispatch<React.SetStateAction<CoordFixTarget | null>>; // 打开表单时互清
  setRadial: React.Dispatch<React.SetStateAction<{ target: CoordFixTarget; x: number; y: number } | null>>;
}): {
  entityForm: EntityFormState | null;
  setEntityForm: React.Dispatch<React.SetStateAction<EntityFormState | null>>;
  entitySaving: boolean;
  entityError: string | null;
  setEntityError: React.Dispatch<React.SetStateAction<string | null>>; // 面板 onClose 清错用
  createMenu: { x: number; y: number; lng: number; lat: number } | null;
  setCreateMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; lng: number; lat: number } | null>>;
  openEntityCreate: (kind: EntityKind, lng: number, lat: number) => void;
  openEntityEdit: (kind: EntityKind, id: string) => Promise<void>;
  saveEntity: () => Promise<void>;
  deleteEntity: (kind: EntityKind, id: string, name: string) => Promise<void>;
} {
  const {
    keyUnits, setKeyUnits, setBuildings, waterRef, bumpWater,
    mapRef, mapInited,
    setGeoCandidates, setPickMode, setCoordFix, setRadial,
  } = deps;

  const [entityForm, setEntityForm] = useState<EntityFormState | null>(null);
  const [entitySaving, setEntitySaving] = useState(false);
  const [entityError, setEntityError] = useState<string | null>(null);
  // 地图空白处右键 → 新增点位菜单
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number; lng: number; lat: number } | null>(null);

  const openEntityCreate = useCallback(
    (kind: EntityKind, lng: number, lat: number) => {
      setEntityForm({ mode: 'create', values: { ...emptyEntityForm(kind), lng, lat } });
      setEntityError(null);
      setGeoCandidates([]);
      setCreateMenu(null);
      setRadial(null);
      setCoordFix(null);
    },
    [setGeoCandidates, setRadial, setCoordFix],
  );

  const openEntityEdit = useCallback(
    async (kind: EntityKind, id: string) => {
      setEntityError(null);
      setGeoCandidates([]);
      let values: EntityFormValues | null = null;
      if (kind === 'water') {
        const w = waterRef.current.find((x) => x.id === id);
        if (!w) return;
        values = {
          ...emptyEntityForm('water'),
          name: w.name, waterType: w.type, districtCode: w.districtCode, address: w.address,
          lng: w.lng, lat: w.lat,
        };
      } else if (kind === 'unit') {
        const u = keyUnits.find((x) => x.id === id);
        if (!u) return;
        values = {
          ...emptyEntityForm('unit'),
          name: u.name, unitType: u.unitType, district: u.district ?? '',
          contactName: u.contactName ?? '', contactPhone: u.contactPhone ?? '', address: u.address ?? '',
          lng: u.lng, lat: u.lat,
        };
      } else {
        // 建筑编辑需高度/面积/层数,列表响应没有,先拉详情预填
        try {
          const d = await fetchKeyBuildingDetail(id);
          if (d.longitude == null || d.latitude == null) return;
          values = {
            ...emptyEntityForm('building'),
            name: d.name, buildingType: d.building_type ?? '', buildingUsage: d.building_usage ?? '',
            buildingHeight: d.building_height != null ? String(d.building_height) : '',
            floorArea: d.floor_area != null ? String(d.floor_area) : '',
            groundFloors: d.ground_floors != null ? String(d.ground_floors) : '',
            undergroundFloors: d.underground_floors != null ? String(d.underground_floors) : '',
            keyUnitId: d.key_unit_id ?? '', address: d.address ?? '',
            lng: d.longitude, lat: d.latitude,
          };
        } catch {
          showToast('加载建筑详情失败');
          return;
        }
      }
      setEntityForm({ mode: 'edit', id, values });
      setRadial(null);
      setCoordFix(null);
    },
    [keyUnits, waterRef, setGeoCandidates, setRadial, setCoordFix],
  );

  const saveEntity = useCallback(async () => {
    if (!entityForm) return;
    setEntitySaving(true);
    setEntityError(null);
    const { mode, id, values } = entityForm;
    try {
      if (values.kind === 'water') {
        const body = buildWaterPayload(values, mode);
        if (mode === 'create') await createWaterSource(body);
        else await updateWaterSource(id!, body);
        bumpWater(); // 触发 bbox/clusters 重取
      } else if (values.kind === 'unit') {
        const body = buildUnitPayload(values);
        if (mode === 'create') await createKeyUnit(body);
        else await updateKeyUnit(id!, body);
        setKeyUnits(await fetchKeyUnits());
      } else {
        const body = buildBuildingPayload(values);
        if (mode === 'create') await createKeyBuilding(body);
        else await updateKeyBuilding(id!, body);
        setBuildings(await fetchKeyBuildings());
      }
      addSceneAction({
        action: 'editEntity',
        target: `${mode === 'create' ? '新增' : '编辑'} · ${values.name}`,
        params: { kind: values.kind, id, lng: values.lng, lat: values.lat },
        source: '面板',
      });
      showToast(mode === 'create' ? '已创建' : '已保存');
      setEntityForm(null);
    } catch (e) {
      setEntityError(e instanceof Error ? e.message : '保存失败(网络或权限)');
    } finally {
      setEntitySaving(false);
    }
  }, [entityForm, bumpWater, setKeyUnits, setBuildings]);

  // 删除:圆环"删除"直删(带确认);表单内删除按钮也走这里
  const deleteEntity = useCallback(
    async (kind: EntityKind, id: string, name: string) => {
      if (!window.confirm(`确认删除「${name}」?删除后不可恢复。`)) return;
      setEntitySaving(true);
      setEntityError(null);
      try {
        if (kind === 'water') {
          await deleteWaterSource(id);
          bumpWater();
        } else if (kind === 'unit') {
          await deleteKeyUnit(id);
          setKeyUnits(await fetchKeyUnits());
        } else {
          await deleteKeyBuilding(id);
          setBuildings(await fetchKeyBuildings());
        }
        addSceneAction({ action: 'editEntity', target: `删除 · ${name}`, params: { kind, id }, source: '面板' });
        showToast('已删除');
        setEntityForm(null);
        setRadial(null);
      } catch {
        setEntityError('删除失败(网络或权限)');
        showToast('删除失败');
      } finally {
        setEntitySaving(false);
      }
    },
    [bumpWater, setKeyUnits, setBuildings, setRadial],
  );

  // 地图空白处右键 → 新增点位菜单(marker 右键已 stopPropagation,不会到这)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    const onCtx = (e: any) => {
      const p = map.latLngToContainerPoint(e.latlng);
      setCreateMenu({ x: p.x, y: p.y, lng: e.latlng.lng, lat: e.latlng.lat });
      setRadial(null);
    };
    const close = () => setCreateMenu(null);
    map.on('contextmenu', onCtx);
    map.on('move zoom click', close);
    return () => {
      map.off('contextmenu', onCtx);
      map.off('move zoom click', close);
    };
  }, [mapRef, mapInited, setRadial]);

  return {
    entityForm, setEntityForm,
    entitySaving, entityError, setEntityError,
    createMenu, setCreateMenu,
    openEntityCreate, openEntityEdit, saveEntity, deleteEntity,
  };
}
