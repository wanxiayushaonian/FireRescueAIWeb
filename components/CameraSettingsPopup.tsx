'use client';

/**
 * 相机操控设置弹窗：由顶栏「设置」按钮打开。
 * 包含「按键提示」与「镜头重置(R)」两个开关，状态由上层持久化到 localStorage。
 */
export function CameraSettingsPopup({
  open,
  keyHintsEnabled,
  resetEnabled,
  onKeyHintsChange,
  onResetEnabledChange,
  onClose,
}: {
  open: boolean;
  keyHintsEnabled: boolean;
  resetEnabled: boolean;
  onKeyHintsChange: (v: boolean) => void;
  onResetEnabledChange: (v: boolean) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="cameraSettings">
      <div className="cameraSettings-head">
        <span className="cameraSettings-title">相机操控设置</span>
        <button type="button" className="cameraSettings-close" onClick={onClose} aria-label="关闭设置">
          ×
        </button>
      </div>
      <div className="cameraSettings-body">
        <label className="cameraSettings-row">
          <div>
            <div className="cameraSettings-row-name">按键提示</div>
            <div className="cameraSettings-row-desc">按下 WASD/EQ 时在屏幕左下角显示对应按键</div>
          </div>
          <input
            type="checkbox"
            checked={keyHintsEnabled}
            onChange={(e) => onKeyHintsChange(e.target.checked)}
          />
        </label>
        <label className="cameraSettings-row">
          <div>
            <div className="cameraSettings-row-name">镜头重置（R）</div>
            <div className="cameraSettings-row-desc">按 R 键回到场景加载时的初始视角</div>
          </div>
          <input
            type="checkbox"
            checked={resetEnabled}
            onChange={(e) => onResetEnabledChange(e.target.checked)}
          />
        </label>
        <div className="cameraSettings-hint">W/S 前后 · A/D 左右 · E/Q 升降 · R 重置视角 · ⇧ 按住减速（精细定位）</div>
      </div>
    </div>
  );
}
