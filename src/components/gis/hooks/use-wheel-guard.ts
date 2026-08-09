'use client';
// 阻止浮层面板的滚轮事件冒泡到 Leaflet 地图容器:默认滚轮会缩放地图,而非滚动面板内
// overflow 列表。React 合成事件 stopPropagation 挡不住 Leaflet —— Leaflet 用原生
// addEventListener('wheel') 绑在 map container 上,事件冒泡先到 container 再到 React
// root,故须在面板根节点用原生监听拦截。
// passive: true → 不阻止浏览器默认滚动,让面板 overflow 容器正常滚动。
import { useEffect } from 'react';

export function useWheelGuard(ref: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.stopPropagation();
    el.addEventListener('wheel', stop, { passive: true });
    return () => el.removeEventListener('wheel', stop);
  }, [ref]);
}
