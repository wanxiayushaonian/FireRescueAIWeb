// 地图点位增删改表单:三类实体(水源/重点单位/重点建筑)的表单值 → znya payload 纯函数。
// 与 UI 解耦可单测;znya 字段约束见 schemas(water 需 ref_type/ref_id,building 有 4 个必填数值)。

export type EntityKind = 'water' | 'unit' | 'building';

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
  water: '水源',
  unit: '重点单位',
  building: '重点建筑',
};

export const WATER_TYPE_OPTIONS = ['市政消火栓', '消防水池', '天然水源', '取水码头'];
export const UNIT_TYPE_OPTIONS = ['重点单位', '联动单位'];

/** 表单值(数值字段保持字符串,提交时解析校验)。 */
export interface EntityFormValues {
  kind: EntityKind;
  name: string;
  address: string;
  lng: number | null;
  lat: number | null;
  // water
  waterType: string;
  districtCode: string;
  // unit
  unitType: string;
  district: string;
  contactName: string;
  contactPhone: string;
  // building
  buildingType: string;
  buildingUsage: string;
  buildingHeight: string;
  floorArea: string;
  groundFloors: string;
  undergroundFloors: string;
  keyUnitId: string;
}

export function emptyEntityForm(kind: EntityKind): EntityFormValues {
  return {
    kind,
    name: '',
    address: '',
    lng: null,
    lat: null,
    waterType: WATER_TYPE_OPTIONS[0],
    districtCode: '',
    unitType: UNIT_TYPE_OPTIONS[0],
    district: '',
    contactName: '',
    contactPhone: '',
    buildingType: '',
    buildingUsage: '',
    buildingHeight: '',
    floorArea: '',
    groundFloors: '',
    undergroundFloors: '0',
    keyUnitId: '',
  };
}

function need(cond: boolean, msg: string): void {
  if (cond) throw new Error(msg);
}

/** 公共校验:名称必填、坐标必填(缺坐标的点在地图上不可见,不允许从地图表单创建)。 */
function checkCommon(v: EntityFormValues): void {
  need(!v.name.trim(), '名称必填');
  need(v.lng == null || v.lat == null, '坐标未设置(地址查询/地图拾取/手动输入)');
}

function num(s: string, label: string, min: number): number {
  const n = Number(s);
  need(s.trim() === '' || Number.isNaN(n), `${label}必须是数字`);
  need(n < min, `${label}不能小于 ${min}`);
  return n;
}

// ---- water ----

export interface WaterPayload {
  ref_type: string;
  ref_id: string;
  water_type: string;
  name: string;
  location_path?: string;
  longitude: number;
  latitude: number;
  district_code?: string;
}

/** create 需 ref_type/ref_id(挂载语义,独立点位用 standalone + 自生成 id);edit 不含这两字段。 */
export function buildWaterPayload(
  v: EntityFormValues,
  mode: 'create' | 'edit',
  idGen: () => string = () => crypto.randomUUID(),
): WaterPayload {
  checkCommon(v);
  need(!v.waterType, '水源类型必填');
  const base: WaterPayload = {
    ref_type: 'standalone',
    ref_id: '',
    water_type: v.waterType,
    name: v.name.trim(),
    longitude: v.lng!,
    latitude: v.lat!,
  };
  if (v.address.trim()) base.location_path = v.address.trim();
  if (v.districtCode) base.district_code = v.districtCode;
  if (mode === 'create') base.ref_id = idGen();
  else {
    delete (base as Partial<WaterPayload>).ref_type;
    delete (base as Partial<WaterPayload>).ref_id;
  }
  return base;
}

// ---- unit ----

export interface UnitPayload {
  name: string;
  unit_type: string;
  district?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  longitude: number;
  latitude: number;
}

export function buildUnitPayload(v: EntityFormValues): UnitPayload {
  checkCommon(v);
  need(!v.unitType, '单位类型必填');
  const p: UnitPayload = {
    name: v.name.trim(),
    unit_type: v.unitType,
    longitude: v.lng!,
    latitude: v.lat!,
  };
  if (v.district.trim()) p.district = v.district.trim();
  if (v.address.trim()) p.address = v.address.trim();
  if (v.contactName.trim()) p.contact_name = v.contactName.trim();
  if (v.contactPhone.trim()) p.contact_phone = v.contactPhone.trim();
  return p;
}

// ---- building(znya 必填:building_type/building_usage/building_height/floor_area/ground_floors/underground_floors)----

export interface BuildingPayload {
  name: string;
  building_type: string;
  building_usage: string;
  building_height: number;
  floor_area: number;
  ground_floors: number;
  underground_floors: number;
  address?: string;
  key_unit_id?: string;
  longitude: number;
  latitude: number;
}

export function buildBuildingPayload(v: EntityFormValues): BuildingPayload {
  checkCommon(v);
  need(!v.buildingType.trim(), '建筑类型必填');
  need(!v.buildingUsage.trim(), '建筑用途必填');
  const p: BuildingPayload = {
    name: v.name.trim(),
    building_type: v.buildingType.trim(),
    building_usage: v.buildingUsage.trim(),
    building_height: num(v.buildingHeight, '高度', 0.01),
    floor_area: num(v.floorArea, '面积', 0.01),
    ground_floors: Math.floor(num(v.groundFloors, '地上层数', 1)),
    underground_floors: Math.floor(num(v.undergroundFloors, '地下层数', 0)),
    longitude: v.lng!,
    latitude: v.lat!,
  };
  if (v.address.trim()) p.address = v.address.trim();
  if (v.keyUnitId) p.key_unit_id = v.keyUnitId;
  return p;
}
