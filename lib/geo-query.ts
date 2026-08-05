// 地理查询纯函数:球面距离(Haversine)与半径过滤。无依赖。
const R = 6371; // 地球半径 km

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 两点球面距离(公里)。 */
export function haversineKm(
  lng1: number, lat1: number,
  lng2: number, lat2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 按半径(米)过滤,返回半径内元素。 */
export function filterByRadius<T>(
  items: T[],
  center: { lng: number; lat: number },
  radiusM: number,
  getLngLat: (item: T) => { lng: number; lat: number },
): T[] {
  const radiusKm = radiusM / 1000;
  return items.filter((item) => {
    const { lng, lat } = getLngLat(item);
    return haversineKm(center.lng, center.lat, lng, lat) <= radiusKm;
  });
}
