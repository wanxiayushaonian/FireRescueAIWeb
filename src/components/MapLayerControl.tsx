'use client';
// 地图图层控制条:底图(矢量/卫星)切换 + 消防站/水源显隐开关。右上角深色常显。
interface Props {
  baseMap: 'vector' | 'satellite';
  onBaseMapChange: (b: 'vector' | 'satellite') => void;
  showStations: boolean;
  onToggleStations: () => void;
  showWater: boolean;
  onToggleWater: () => void;
}

export default function MapLayerControl({
  baseMap,
  onBaseMapChange,
  showStations,
  onToggleStations,
  showWater,
  onToggleWater,
}: Props) {
  return (
    <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1.5 rounded border border-line bg-bg-panel/90 p-2 text-[12px] backdrop-blur">
      <div className="flex items-center gap-1">
        <span className="mr-0.5 text-text-3">底图</span>
        {(['vector', 'satellite'] as const).map((b) => (
          <button
            key={b}
            onClick={() => onBaseMapChange(b)}
            className={`rounded px-2 py-0.5 transition-colors ${
              baseMap === b
                ? 'border border-amber-300/40 bg-amber-300/15 text-amber-300'
                : 'border border-line text-text-3 hover:text-text-1'
            }`}
          >
            {b === 'vector' ? '矢量' : '卫星'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="mr-0.5 text-text-3">图层</span>
        <button
          onClick={onToggleStations}
          className={`rounded px-1.5 py-0.5 transition-colors hover:text-text-1 ${
            showStations ? 'text-amber-300' : 'text-text-3 line-through'
          }`}
        >
          消防站
        </button>
        <button
          onClick={onToggleWater}
          className={`rounded px-1.5 py-0.5 transition-colors hover:text-text-1 ${
            showWater ? 'text-amber-300' : 'text-text-3 line-through'
          }`}
        >
          水源
        </button>
      </div>
    </div>
  );
}
