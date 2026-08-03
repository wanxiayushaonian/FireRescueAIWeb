export type GeneratedPanelInfo = {
  id: string;
  name: string;
  aliases?: string[];
  domId: string;
  description: string;
};

export const GENERATED_PANELS: GeneratedPanelInfo[] = [
  {
    id: 'fire-safety',
    name: '消防设施分布',
    aliases: ['消防', '消防设施', 'fire safety', 'fire facility'],
    domId: 'panel-fire-safety',
    description: '展示场景中消防设备的类型统计、楼层分布、设备清单，读取真实运行状态，支持一键定位和高亮。',
  },
  {
    id: 'emergency-plan',
    name: '应急预案',
    aliases: ['预案', '应急', 'emergency plan', 'plan'],
    domId: 'panel-emergency-plan',
    description: '展示应急预案列表和详情，点击执行后自动切换楼层、显示路线并定位高亮关键设备。',
  },
  {
    id: 'camera-path',
    name: '镜头路径',
    aliases: ['镜头路径', '镜头动画', '相机路径', 'camera path', 'path point'],
    domId: 'panel-camera-path',
    description: '把当前镜头保存为路径点，按顺序播放成镜头动画；支持 agent 通过 window.__cameraPathTool 控制添加、播放、跳转与删除。',
  },
];
