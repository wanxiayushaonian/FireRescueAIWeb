// 重点单位(key_units)数据映射:znya /key-units → KeyUnit 点位形状。
// 重点单位 = 消防重点单位(平台核心业务对象:3D 建模/演练对抗/熟悉考核的围绕单位)。
export interface ZnyaKeyUnit {
  id: string;
  name: string;
  unit_type: string;
  district?: string | null;
  address?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  status?: string | null;
  extra_attrs?: Record<string, unknown> | null;
}

export interface KeyUnit {
  id: string;
  name: string;
  unitType: string;
  district?: string;
  address?: string;
  lng: number;
  lat: number;
  contactName?: string;
  contactPhone?: string;
  status: string;
  extra: Record<string, unknown>;
}

/** 映射 znya 重点单位 → KeyUnit;无坐标(未地理编码命中)返回 null,不在地图显示。 */
export function mapKeyUnit(z: ZnyaKeyUnit): KeyUnit | null {
  if (z.longitude == null || z.latitude == null) return null;
  return {
    id: z.id,
    name: z.name,
    unitType: z.unit_type,
    district: z.district ?? undefined,
    address: z.address ?? undefined,
    lng: z.longitude,
    lat: z.latitude,
    contactName: z.contact_name ?? undefined,
    contactPhone: z.contact_phone ?? undefined,
    status: z.status ?? 'draft',
    extra: (z.extra_attrs ?? {}) as Record<string, unknown>,
  };
}
