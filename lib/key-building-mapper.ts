// 重点建筑(key_buildings)数据映射:znya /key-buildings → KeyBuilding 点位。
// 重点建筑是重点单位下的建筑(key_unit_id 关联);seed 数据可能未关联单位。
export interface ZnyaKeyBuilding {
  id: string;
  name: string;
  building_type?: string | null;
  building_usage?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  key_unit_id?: string | null;
  status?: string | null;
}

export interface KeyBuilding {
  id: string;
  name: string;
  buildingType?: string;
  buildingUsage?: string;
  lng: number;
  lat: number;
  keyUnitId?: string;
  status: string;
}

/** 映射 znya 重点建筑 → KeyBuilding;无坐标返回 null,不在地图显示。 */
export function mapKeyBuilding(z: ZnyaKeyBuilding): KeyBuilding | null {
  if (z.longitude == null || z.latitude == null) return null;
  return {
    id: z.id,
    name: z.name,
    buildingType: z.building_type ?? undefined,
    buildingUsage: z.building_usage ?? undefined,
    lng: z.longitude,
    lat: z.latitude,
    keyUnitId: z.key_unit_id ?? undefined,
    status: z.status ?? 'draft',
  };
}
