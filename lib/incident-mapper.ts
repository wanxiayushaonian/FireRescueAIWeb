// 警情数据映射:znya /incidents → Incident 形状。
// 坐标系 GCJ02(与重点单位一致,前端直接渲染,无需转换)。
export interface ZnyaIncident {
  id: string;
  address: string;
  incident_type: string;
  level: number;
  longitude?: number | null;
  latitude?: number | null;
  status: string;
  occurred_at?: string | null;
  description?: string | null;
  key_unit_id?: string | null;
  key_building_id?: string | null;
}

export interface Incident {
  id: string;
  address: string;
  incidentType: string;
  level: number; // 1-5(1 最重)
  lng: number; // GCJ02
  lat: number; // GCJ02
  status: string; // 接警/出动/到场/控制/结束
  occurredAt?: string;
  description?: string;
  keyUnitId?: string; // 关联重点单位(警情发生在该单位)
  keyBuildingId?: string;
}

/** 映射 znya 警情 → Incident(坐标 null 返回 null,被 fetch 过滤)。 */
export function mapIncident(z: ZnyaIncident): Incident | null {
  if (z.longitude == null || z.latitude == null) return null;
  return {
    id: z.id,
    address: z.address,
    incidentType: z.incident_type,
    level: z.level,
    lng: z.longitude,
    lat: z.latitude,
    status: z.status,
    occurredAt: z.occurred_at ?? undefined,
    description: z.description ?? undefined,
    keyUnitId: z.key_unit_id ?? undefined,
    keyBuildingId: z.key_building_id ?? undefined,
  };
}
