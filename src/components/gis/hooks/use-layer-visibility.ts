'use client';
import { useEffect } from 'react';
import type L from 'leaflet';
import type { GisLayers } from './use-leaflet-map';

/** 图层显隐:flag 变化时 addTo/removeLayer(替代原 7 个逐字重复的 effect)。 */
export function useLayerVisibility(
  mapRef: React.MutableRefObject<L.Map | null>,
  layers: GisLayers,
  mapInited: boolean,
  flags: { boundary: boolean; stations: boolean; water: boolean; incidents: boolean; keyUnits: boolean; buildings: boolean; regions: boolean; incidentResponse: boolean },
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    (Object.keys(flags) as Array<keyof typeof flags>).forEach((k) => {
      const layer = layers[k];
      if (!layer) return;
      if (flags[k]) layer.addTo(map);
      else map.removeLayer(layer);
    });
    // 逐 key 依赖,与原 7 个独立 effect 的触发时机一致
  }, [mapInited, flags.boundary, flags.stations, flags.water, flags.incidents, flags.keyUnits, flags.buildings, flags.regions, flags.incidentResponse]);
}
