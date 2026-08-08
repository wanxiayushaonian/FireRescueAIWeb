// 灾情响应 ETA 配色 / 估算半径 / 格式化(纯函数,无 Leaflet/IO)。

export type EtaLevel = 'green' | 'yellow' | 'red';

/** ETA → 到场等级。targetMin 为目标到场分钟(默认 5):<=target 绿 / target~2×target 黄 / >2×target 红。 */
export function etaColor(etaSec: number, targetMin = 5): EtaLevel {
  const target = targetMin * 60;
  if (etaSec <= target) return 'green';
  if (etaSec <= target * 2) return 'yellow';
  return 'red';
}

/** 5min 驾车估算半径(城区默认 30km/h):minutes/60 × speedKmh。 */
export function estimateRadiusKm(minutes: number, speedKmh = 30): number {
  return (minutes / 60) * speedKmh;
}

/** 秒 → "45秒" / "2分5秒" / "2分钟"。 */
export function formatEta(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}秒`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
}
