// 坐标基准转换(纯函数)。
// 背景:znya 业务库与 GIS 2D 层统一 GCJ02(高德);而 ustudio-sdk 的
// navigateFromExternal 起点要求 **WGS84**(标准经纬度)。两者有国测局偏移
// (国内 ~几百米),直传会导致场外导航起点落错位置,故进场前先转换。
//
// 注意:本文件**只用于 3D SDK 场外导航起点近似**;GIS 2D 层(高德瓦片)保持
// GCJ02 不做转换(RealGisMap 约定)。算法为公开近似(单程逆变换,精度米级,部分
// 城市纬度会过冲 ~0.002°,对"从建筑外进场"的示意起点足够);境外坐标原样返回。

const PI = Math.PI;
const A = 6378245.0; // 克氏椭球长半轴(m)
const EE = 0.00669342162296594323; // 偏心率平方

/** 是否超出中国范围(GCJ02 偏移仅在国内生效)。 */
export function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320.0 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** 火星坐标(GCJ02)→ WGS84 近似逆变换(仅国内偏移,境外原样返回)。 */
export function gcj02ToWgs84(lng: number, lat: number): { lon: number; lat: number } {
  if (outOfChina(lng, lat)) return { lon: lng, lat };
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLatAdj = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  const dLngAdj = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lon: lng - dLngAdj, lat: lat - dLatAdj };
}
