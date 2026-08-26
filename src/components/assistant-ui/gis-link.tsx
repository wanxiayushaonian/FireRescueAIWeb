// GIS 地名锚点 chip:点击让 RealGisMap 飞行定位到实体坐标(经 window 'gis:fly-to' 事件)。
// 与 SceneLink(3D 场景锚点)成对:scene:// 管 3D,gis:// 管地图。
import { useState } from 'react';
import { showToast } from '@/components/Toast';

export function GisLink({ name, lng, lat }: { name: string; lng: number; lat: number }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      title={`点击在地图定位 ${name}`}
      onClick={() => {
        setBusy(true);
        try {
          window.dispatchEvent(new CustomEvent('gis:fly-to', { detail: { lng, lat, label: name } }));
          showToast(`已在地图定位 ${name}`);
        } finally {
          setBusy(false);
        }
      }}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded border border-cyan/40 bg-cyan/10 px-1.5 py-px align-baseline text-[0.9em] font-medium text-cyan transition hover:bg-cyan/20 disabled:opacity-60"
    >
      <svg viewBox="0 0 16 16" className="mr-0.5 h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M2 6.5 14 2l-4.5 12L7.5 9 2 6.5Z" />
        <path d="M7.5 9 14 2" />
      </svg>
      {name}
    </button>
  );
}
