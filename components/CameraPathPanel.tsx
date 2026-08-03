'use client';

import { useEffect, useState } from 'react';
import { PanelShell } from './PanelShell';
import {
  getCameraPathPlaying,
  getCameraPathPoints,
  subscribeCameraPath,
} from '@/lib/camera-path';
import type { CameraPathPoint } from '@/lib/camera-path';

function formatVec(v: { x: number; y: number; z: number }): string {
  return `${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`;
}

export function CameraPathPanel() {
  const [points, setPoints] = useState<CameraPathPoint[]>(() => getCameraPathPoints());
  const [playing, setPlaying] = useState(() => getCameraPathPlaying());

  useEffect(() => {
    const unsub = subscribeCameraPath(() => {
      setPoints(getCameraPathPoints());
      setPlaying(getCameraPathPlaying());
    });
    return unsub;
  }, []);

  const canAdd = typeof window !== 'undefined' && !!window.__scene;

  return (
    <div id="panel-camera-path">
      <PanelShell
        name="camera-path"
        title="镜头路径"
        description="把当前镜头保存为路径点，按顺序播放成镜头动画，支持 agent 调用 window.__cameraPathTool 控制。"
        position="top-right"
        width={360}
      >
        <div className="cp-panel thin-scroll">
          <div className="cp-actions">
            <button
              type="button"
              className="cp-btn cp-btn--primary"
              disabled={!canAdd}
              title={canAdd ? '把当前镜头保存为一个路径点' : '场景未加载，无法添加路径点'}
              onClick={() => {
                window.__cameraPathTool?.add();
              }}
            >
              ＋ 添加当前视角
            </button>
            <button
              type="button"
              className={'cp-btn' + (playing ? ' is-playing' : '')}
              disabled={points.length === 0}
              onClick={() => {
                if (playing) window.__cameraPathTool?.stop();
                else window.__cameraPathTool?.play();
              }}
            >
              {playing ? '■ 停止' : '▶ 播放'}
            </button>
            <button
              type="button"
              className="cp-btn"
              disabled={points.length === 0}
              onClick={() => window.__cameraPathTool?.clear()}
            >
              清空
            </button>
          </div>

          {points.length === 0 ? (
            <div className="cp-empty">
              暂无路径点。调整好镜头角度后，点击「添加当前视角」记录一个点，再添加几个点即可播放成镜头动画。
            </div>
          ) : (
            <ol className="cp-list">
              {points.map((point, index) => (
                <li key={point.id} className="cp-item">
                  <span className="cp-item-index">{index + 1}</span>
                  <div className="cp-item-body">
                    <div className="cp-item-line">
                      <span className="cp-item-label">位置</span>
                      <code>{formatVec(point.position)}</code>
                    </div>
                    <div className="cp-item-line">
                      <span className="cp-item-label">朝向</span>
                      <code>{formatVec(point.target)}</code>
                    </div>
                  </div>
                  <div className="cp-item-ops">
                    <button
                      type="button"
                      className="cp-mini"
                      title="飞到该路径点预览"
                      onClick={() => void window.__cameraPathTool?.jumpTo(point.id)}
                    >
                      预览
                    </button>
                    <button
                      type="button"
                      className="cp-mini cp-mini--danger"
                      title="删除该路径点"
                      onClick={() => window.__cameraPathTool?.remove(point.id)}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <p className="cp-hint">
            提示：agent 与聊天代码可通过 <code>window.__cameraPathTool</code>{' '}
            的 list / add / remove / clear / play / stop / jumpTo 控制本工具，与界面实时同步。
          </p>
        </div>
      </PanelShell>
    </div>
  );
}
