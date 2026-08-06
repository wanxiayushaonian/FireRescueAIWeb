'use client';
// 地图图层控制条:底图(矢量/卫星)切换 + 各图层显隐 + 划定区域。右上角深色常显。
interface Props {
  baseMap: 'vector' | 'satellite';
  onBaseMapChange: (b: 'vector' | 'satellite') => void;
  showStations: boolean;
  onToggleStations: () => void;
  showWater: boolean;
  onToggleWater: () => void;
  showBoundary: boolean;
  onToggleBoundary: () => void;
  showKeyUnits: boolean;
  onToggleKeyUnits: () => void;
  showBuildings: boolean;
  onToggleBuildings: () => void;
  showRegions: boolean;
  onToggleRegions: () => void;
  drawMode: boolean;
  onStartDraw: () => void;
  onCancelDraw: () => void;
}

export default function MapLayerControl({
  baseMap,
  onBaseMapChange,
  showStations,
  onToggleStations,
  showWater,
  onToggleWater,
  showBoundary,
  onToggleBoundary,
  showKeyUnits,
  onToggleKeyUnits,
  showBuildings,
  onToggleBuildings,
  showRegions,
  onToggleRegions,
  drawMode,
  onStartDraw,
  onCancelDraw,
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
        <button
          onClick={onToggleBoundary}
          className={`rounded px-1.5 py-0.5 transition-colors hover:text-text-1 ${
            showBoundary ? 'text-amber-300' : 'text-text-3 line-through'
          }`}
        >
          边界
        </button>
        <button
          onClick={onToggleKeyUnits}
          className={`rounded px-1.5 py-0.5 transition-colors hover:text-text-1 ${
            showKeyUnits ? 'text-amber-300' : 'text-text-3 line-through'
          }`}
        >
          重点单位
        </button>
        <button
          onClick={onToggleBuildings}
          className={`rounded px-1.5 py-0.5 transition-colors hover:text-text-1 ${
            showBuildings ? 'text-amber-300' : 'text-text-3 line-through'
          }`}
        >
          重点建筑
        </button>
        <button
          onClick={onToggleRegions}
          className={`rounded px-1.5 py-0.5 transition-colors hover:text-text-1 ${
            showRegions ? 'text-amber-300' : 'text-text-3 line-through'
          }`}
        >
          区域
        </button>
      </div>
      <div className="flex items-center gap-1 border-t border-line/60 pt-1.5">
        <span className="mr-0.5 text-text-3">标注</span>
        {drawMode ? (
          <button
            onClick={onCancelDraw}
            className="rounded px-2 py-0.5 border border-red-400/40 bg-red-400/10 text-red-300"
          >
            取消划定
          </button>
        ) : (
          <button
            onClick={onStartDraw}
            className="rounded px-2 py-0.5 border border-amber-300/40 bg-amber-300/15 text-amber-300"
          >
            ✏️ 划定区域
          </button>
        )}
      </div>
    </div>
  );
}
