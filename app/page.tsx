import { SoonspaceSceneViewer } from '@/components/SoonspaceSceneViewer';
import { MultiAgentWidget } from '@/components/MultiAgentWidget';
import { FireSafetyPanel } from '@/components/FireSafetyPanel';
import { PlanPanel } from '@/components/PlanPanel';

const fallbackText =
  process.env.NEXT_PUBLIC_LOCALE === 'en'
    ? {
        title: 'Loading preview...',
        detail: 'Preparing scene runtime...',
      }
    : {
        title: '正在加载预览画面...',
        detail: '正在准备场景运行时...',
      };

export default function Page() {
  return (
    <>
      <div id="jarvis-preview-fallback" className="previewServerFallback" role="status" aria-live="polite">
        <div className="previewServerFallback__panel">
          <div className="previewServerFallback__title">{fallbackText.title}</div>
          <div className="previewServerFallback__bar" aria-hidden>
            <span />
          </div>
          <div className="previewServerFallback__detail">{fallbackText.detail}</div>
        </div>
      </div>
      <SoonspaceSceneViewer />
      <FireSafetyPanel />
      <PlanPanel />
      <MultiAgentWidget />
    </>
  );
}
