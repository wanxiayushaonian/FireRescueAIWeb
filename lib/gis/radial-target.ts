// lib/gis/radial-target.ts
// 圆环菜单目标类型:各图层渲染器(render-stations/render-water/render-key-units/
// render-key-buildings/render-incidents)共用,独立成文件避免渲染器之间互相 import。

/** 圆环菜单目标(结构类型,与 src/components/gis/CoordinateFixPanel 的 CoordFixTarget 同构;lib 不得 import src)。 */
export interface RadialTarget {
  kind: 'unit' | 'building' | 'station' | 'incident' | 'water';
  id: string;
  name: string;
  type?: string; // 消防站类型(仅 kind=station 用)
  lng: number; // GCJ02
  lat: number;
  sceneId?: string; // uStudio 建模场景 ID(仅 kind=building 用,3D引导)
}
