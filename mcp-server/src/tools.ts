import { getSceneOverview, getFireDeviceList, getFloorList } from './bff-client.js';
import { getBuildingProfile, getFacilities, getKeyParts, getKnowledge } from './business-client.js';
import { querySceneState, injectEvent, reportDecision } from './drill-control.js';
import { publishCommand } from './command-bus.js';
import type { SceneCommand } from './types.js';

export const TOOLS = [
  {
    name: 'list_fire_devices',
    description: '查询当前场景的消防设备清单(含 id/name/type,id 供 fly_to 使用)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_floors',
    description: '查询当前场景的楼层清单(含 id/name,id 供 focus_floors 使用)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'focus_objects',
    description: '高亮聚焦一组场景对象(设备 id 来自 list_fire_devices),并飞向首个;空数组清除高亮',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, description: '对象 id 列表' } },
      required: ['ids'],
    },
  },
  {
    name: 'focus_floors',
    description: '隔离显示选中的楼层(其余层隐藏);楼层 id 来自 list_floors;空数组恢复全楼层',
    inputSchema: {
      type: 'object',
      properties: { story_ids: { type: 'array', items: { type: 'string' }, description: '楼层 id 列表' } },
      required: ['story_ids'],
    },
  },
  {
    name: 'fly_to',
    description: '让 3D 场景镜头飞向指定对象(target 为对象 id)',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: '场景对象 id(来自 list_fire_devices)' } },
      required: ['target'],
    },
  },
  {
    name: 'gis_fly_to',
    description: '让 2D 态势总览 GIS 地图飞向指定坐标(风险研判时定位警情/波及单位/水源等点位;坐标为 GCJ02,与高德底图一致,地址可先经 Python MCP geocode_address 解析)',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: '纬度(GCJ02)' },
        lng: { type: 'number', description: '经度(GCJ02)' },
        zoom: { type: 'number', description: '缩放级别(可选,默认 15;参考:11=九江市全域,14=街区,16=建筑级;实际取 max(当前缩放,该值))' },
        label: { type: 'string', description: '点位名称(可选,用于场景动作日志显示)' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'show_route',
    description: '在 2D 态势总览渲染多站派遣路线(routes: 路线数组,每项含 stationName/polyline[[lat,lng]]/distance/duration/trafficLights;业务查询/规划走 Python MCP,本工具只负责场景渲染)',
    inputSchema: {
      type: 'object',
      properties: {
        routes: { type: 'array', items: { type: 'object' } },
        target: { type: 'string', description: '目标名称(可选)' },
      },
      required: ['routes'],
    },
  },
  // ─── 业务查询(对接 znya /api/business/*,供演练 agent 查建筑档案)───
  {
    name: 'query_building_profile',
    description: '查询重点建筑档案概要(名称/地址/层数/高度/联系人 + structure_designs/surroundings 原始嵌套),数据来自 znya key_buildings/{id}。返回 BuildingProfileSummary JSON。',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: {
          type: 'string',
          description: 'znya key_buildings 的 id(UUID),如 21号楼(乐盈广场)为 1c2d4772-831d-4c77-b88a-f9565ad589c7',
        },
      },
      required: ['building_id'],
    },
  },
  {
    name: 'query_facilities',
    description: '查询建筑的消防设施清单(消火栓/喷淋/报警/应急照明等,来自 znya fire_facilities,ref_type=key_building)。可按楼层(location_path 子串)与类型(facility_type 子串,大小写不敏感)过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'znya key_buildings 的 id(UUID)' },
        floor: { type: 'string', description: '楼层过滤(子串匹配 location_path,如 "三层"/"B1",可选)' },
        type: { type: 'string', description: '类型过滤(facility_type 子串,大小写不敏感,如 "消火栓"/"Sprinkler",可选)' },
      },
      required: ['building_id'],
    },
  },
  {
    name: 'query_key_parts',
    description: '查询建筑的重点部位(key_floors:避难层/消控室/防火分区等,含火灾危险性/疏散出口/责任人),数据来自 znya key_buildings/{id}.key_floors。',
    inputSchema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', description: 'znya key_buildings 的 id(UUID)' },
      },
      required: ['building_id'],
    },
  },
  // ─── 推演控制 stub(对接推演引擎 6.2/6.3 前,MVP 占位)───
  {
    name: 'query_scene_state',
    description: '查询当前演练态势(火势/到场力量/被困/已用路线)。⚠️ 推演引擎(子项目6.2/6.3)未对接,返回 wired=false stub,需在 6.2 完成后对接 DisasterState。',
    inputSchema: {
      type: 'object',
      properties: {
        drill_id: { type: 'string', description: '演练会话 id(与 agent-chat conversation_id 对齐)' },
      },
      required: ['drill_id'],
    },
  },
  {
    name: 'inject_event',
    description: '注入对抗事件(对抗 agent 用,如风向突变/爆炸/二次被困)。⚠️ 推演引擎(6.2)未对接,当前只记日志并经 /scene-events 占位转发,不驱动状态推进。',
    inputSchema: {
      type: 'object',
      properties: {
        drill_id: { type: 'string', description: '演练会话 id' },
        event: {
          type: 'object',
          description: '事件载荷(自由结构,常见字段:type=wind_shift/explosion/secondary_trapped, payload={...})',
        },
      },
      required: ['drill_id', 'event'],
    },
  },
  {
    name: 'query_knowledge',
    description: '检索历史预案知识库(191 chunks 真实预案:万达/医院/21号楼/政府等的安全提示/灾情场景/战斗部署/力量部署/通信联络)。返回相关 chunks(content+score+来源文档名)。供 agent 回答消防预案/风险/处置类问题(基于真实预案,非 LLM 通用知识编造)。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索查询(如"高层建筑火灾风险""医院疏散病人""化工厂处置")' },
        top_k: { type: 'number', description: '返回条数(默认 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'report_decision',
    description: '上报主智能体决策入事件树(供复盘 + 触发渲染)。⚠️ 推演引擎(6.3 DrillRecorder)未对接,当前只记日志并经 /scene-events 占位转发,不写入事件树。',
    inputSchema: {
      type: 'object',
      properties: {
        drill_id: { type: 'string', description: '演练会话 id' },
        decision: {
          type: 'object',
          description: '决策载荷(自由结构,常见字段:action=dispatch/retreat/ventilate, rationale=..., targets=[...])',
        },
      },
      required: ['drill_id', 'decision'],
    },
  },
] as const;

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  const sceneId = process.env.SCENE_ID || '';

  if (name === 'list_fire_devices') {
    const [devices, overview] = await Promise.all([
      getFireDeviceList({ sceneId }),
      getSceneOverview({ sceneId }).catch(() => null),
    ]);
    // 全量清单可能很大(tree 14MB),只给 agent 前 50 条 + 统计,避免 token 爆炸
    const shown = devices.slice(0, 50).map((d) => ({ id: d.id, name: d.name, type: d.type }));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: devices.length,
          devices: shown,
          truncated: devices.length > 50,
          overview,
        }, null, 2),
      }],
    };
  }

  if (name === 'list_floors') {
    const floors = await getFloorList({ sceneId });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ total: floors.length, floors }, null, 2),
      }],
    };
  }

  if (name === 'focus_objects') {
    const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String) : [];
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'focus_objects',
      args: { ids },
      ts: Date.now(),
    };
    publishCommand(cmd);
    const action = ids.length === 0 ? '已清除聚焦高亮' : `已聚焦 ${ids.length} 个对象`;
    return {
      content: [{
        type: 'text',
        text: `已下发 focus_objects:${action}。命令经 /scene-events 推送;仅当页面在线且场景 SDK 就绪时生效,通道为单向无回执。`,
      }],
    };
  }

  if (name === 'focus_floors') {
    const storyIds = Array.isArray(args.story_ids) ? (args.story_ids as unknown[]).map(String) : [];
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'focus_floors',
      args: { story_ids: storyIds },
      ts: Date.now(),
    };
    publishCommand(cmd);
    const floorAction = storyIds.length === 0 ? '已恢复全楼层' : `已隔离 ${storyIds.length} 层`;
    return {
      content: [{
        type: 'text',
        text: `已下发 focus_floors:${floorAction}。命令经 /scene-events 推送;仅当页面在线且场景 SDK 就绪时生效,通道为单向无回执。`,
      }],
    };
  }

  if (name === 'fly_to') {
    const target = String(args.target ?? '').trim();
    if (!target) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'fly_to 缺少 target:需提供场景对象 id(可用 list_fire_devices 查询)' }],
      };
    }
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'fly_to',
      args: { target },
      ts: Date.now(),
    };
    publishCommand(cmd);
    // 命令通道是单向 fire-and-forget:这里只表示「已下发」,不代表场景已执行。
    // 场景页面离线 / SDK 未就绪 / EventSource 重连窗口都会导致命令丢失且无回执。
    return {
      content: [{
        type: 'text',
        text: `已下发 fly_to -> ${target}:命令经 /scene-events 推送至场景页面。仅当页面在线且场景 SDK 就绪时才会执行;命令通道为单向,无执行回执,实际效果需另行确认。`,
      }],
    };
  }

  if (name === 'gis_fly_to') {
    const lat = Number(args.lat);
    const lng = Number(args.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'gis_fly_to 缺少/非法 lat,lng:需提供 GCJ02 数值坐标(地址可先经 geocode_address 解析)' }],
      };
    }
    const zoom = Number(args.zoom);
    const label = args.label != null ? String(args.label).slice(0, 50) : '';
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'gis_fly_to',
      args: {
        lat,
        lng,
        ...(Number.isFinite(zoom) ? { zoom } : {}),
        ...(label ? { label } : {}),
      },
      ts: Date.now(),
    };
    publishCommand(cmd);
    return {
      content: [{
        type: 'text',
        text: `已下发 gis_fly_to -> ${label || `${lng},${lat}`}:命令经 /scene-events 推送至态势总览 GIS 地图。仅当页面在线且地图就绪时生效,通道单向无回执。`,
      }],
    };
  }

  if (name === 'show_route') {
    const routes = Array.isArray(args.routes) ? (args.routes as unknown[]) : [];
    if (routes.length === 0) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'show_route 缺少 routes:需提供路线数组(可先经业务 Python MCP 规划)' }],
      };
    }
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'show_route',
      args: { routes, target: String(args.target ?? '') },
      ts: Date.now(),
    };
    publishCommand(cmd);
    return {
      content: [{
        type: 'text',
        text: `已下发 show_route(${routes.length} 站):命令经 /scene-events 推送至 2D 态势总览渲染。仅当页面在线且地图就绪时生效,通道为单向无回执。`,
      }],
    };
  }

  // ─── 业务查询:对接 znya /api/business/*(经 web BFF,x-app-key 鉴权)───
  if (name === 'query_building_profile') {
    const buildingId = String(args.building_id ?? '').trim();
    if (!buildingId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'query_building_profile 缺少 building_id:需提供 znya key_buildings 的 id(UUID)' }],
      };
    }
    const profile = await getBuildingProfile(buildingId);
    return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] };
  }

  if (name === 'query_facilities') {
    const buildingId = String(args.building_id ?? '').trim();
    if (!buildingId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'query_facilities 缺少 building_id:需提供 znya key_buildings 的 id(UUID)' }],
      };
    }
    const floor = args.floor != null ? String(args.floor) : undefined;
    const type = args.type != null ? String(args.type) : undefined;
    const facilities = await getFacilities(buildingId, { floor, type });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ total: facilities.length, facilities, truncated: facilities.length >= 100 }, null, 2),
      }],
    };
  }

  if (name === 'query_key_parts') {
    const buildingId = String(args.building_id ?? '').trim();
    if (!buildingId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'query_key_parts 缺少 building_id:需提供 znya key_buildings 的 id(UUID)' }],
      };
    }
    const keyParts = await getKeyParts(buildingId);
    return {
      content: [{ type: 'text', text: JSON.stringify({ total: keyParts.length, keyParts }, null, 2) }],
    };
  }

  // ─── 推演控制 stub(对接推演引擎 6.2/6.3 前,记日志 + 占位转发)───
  if (name === 'query_scene_state') {
    const drillId = String(args.drill_id ?? '').trim();
    if (!drillId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'query_scene_state 缺少 drill_id:需提供演练会话 id' }],
      };
    }
    const state = querySceneState(drillId);
    return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
  }

  if (name === 'inject_event') {
    const drillId = String(args.drill_id ?? '').trim();
    if (!drillId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'inject_event 缺少 drill_id:需提供演练会话 id' }],
      };
    }
    const event = args.event;
    if (!event || typeof event !== 'object') {
      return {
        isError: true,
        content: [{ type: 'text', text: 'inject_event 缺少 event:需提供事件载荷对象(如 {type:"wind_shift", payload:{...}})' }],
      };
    }
    const ack = injectEvent(drillId, event, publishCommand);
    return { content: [{ type: 'text', text: JSON.stringify(ack, null, 2) }] };
  }

  if (name === 'query_knowledge') {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'query_knowledge 缺少 query:需提供检索查询(如"高层建筑火灾风险")' }],
      };
    }
    const topK = args.top_k != null ? Number(args.top_k) : undefined;
    const result = await getKnowledge(query, { topK });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  if (name === 'report_decision') {
    const drillId = String(args.drill_id ?? '').trim();
    if (!drillId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'report_decision 缺少 drill_id:需提供演练会话 id' }],
      };
    }
    const decision = args.decision;
    if (!decision || typeof decision !== 'object') {
      return {
        isError: true,
        content: [{ type: 'text', text: 'report_decision 缺少 decision:需提供决策载荷对象(如 {action:"dispatch", targets:[...], rationale:"..."}' }],
      };
    }
    const ack = reportDecision(drillId, decision, publishCommand);
    return { content: [{ type: 'text', text: JSON.stringify(ack, null, 2) }] };
  }

  throw new Error(`unknown tool: ${name}`);
}
