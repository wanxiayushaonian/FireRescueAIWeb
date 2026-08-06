// 重点区域(regions)数据映射:znya /regions → Region 形状。
// 区域为手动划定的多边形(GCJ02),态势总揽高亮显示。
export interface ZnyaRegion {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  region_type?: string | null;
  polygon: number[][]; // [[lng, lat], ...] GCJ02
}

export interface Region {
  id: string;
  name: string;
  description?: string;
  color: string;
  regionType?: string;
  polygon: [number, number][];
}

/** 映射 znya 区域 → Region(多边形坐标 [[lng,lat]] → Leaflet [lat,lng] 或保持 [lng,lat]?) */
export function mapRegion(z: ZnyaRegion): Region {
  return {
    id: z.id,
    name: z.name,
    description: z.description ?? undefined,
    color: z.color,
    regionType: z.region_type ?? undefined,
    polygon: z.polygon.map((p) => [p[1], p[0]] as [number, number]), // [lng,lat](存储)→ [lat,lng](Leaflet 渲染顺序)
  };
}
