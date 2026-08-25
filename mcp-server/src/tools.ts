import { getSceneOverview, getFireDeviceList, getFloorList } from './bff-client.js';
import { getBuildingProfile, getFacilities, getKeyParts, getKnowledge } from './business-client.js';
import { querySceneState, injectEvent, reportDecision } from './drill-control.js';
import { publishCommand } from './command-bus.js';
import { getCommandStatus } from './command-status.js';
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
    description: '隔离显示选中的楼层(其余层隐藏)并聚焦视角到首个楼层;楼层 id 来自 list_floors;空数组恢复全楼层(不移动视角)。fly_to_first=false 仅独显不移动视角。',
    inputSchema: {
      type: 'object',
      properties: {
        story_ids: { type: 'array', items: { type: 'string' }, description: '楼层 id 列表' },
        fly_to_first: { type: 'boolean', description: '是否飞向首个楼层(默认 true)' },
      },
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
    description: '让 2D 态势总览 GIS 地图飞向指定坐标(风险研判时定位警情/波及单位/水源等点位;坐标为 GCJ02,与高德底图一致,地址可先经 Python MCP geocode_address 解析)。目标点会显示脉冲标记;带 layer 时若该图层未打开会自动打开,确保用户能看到目标点位',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: '纬度(GCJ02)' },
        lng: { type: 'number', description: '经度(GCJ02)' },
        zoom: { type: 'number', description: '缩放级别(可选,默认 15;参考:11=九江市全域,14=街区,16=建筑级;实际取 max(当前缩放,该值))' },
        label: { type: 'string', description: '点位名称(可选,脉冲标记旁显示)' },
        layer: { type: 'string', description: '目标所属图层(可选;该图层未开时自动打开):water=消防水源,units=重点单位(联动重点建筑),stations=消防站,buildings=重点建筑,incidents=警情', enum: ['water', 'units', 'stations', 'buildings', 'incidents'] },
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
  {
    name: 'get_scene_command_status',
    description: '查询场景命令的执行回执(fly_to/focus_objects/focus_floors/gis_fly_to/show_route 等下发后的执行结果;浏览器在线执行后回传,10 分钟有效)。返回 ok=已执行/error=执行失败+原因/not_found=未执行或已过期。用于确认 3D/GIS 动作是否真正落地(命令通道为异步,下发不代表已执行)。',
    inputSchema: {
      type: 'object',
      properties: {
        cmd_id: { type: 'string', description: '命令 id(下发命令的返回/日志中的 cmd_xxx)' },
      },
      required: ['cmd_id'],
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
  // ─── 推演控制(云端 → 浏览器对抗舱;执行结果用 get_scene_command_status 查 ack)───
  {
    name: 'query_scene_state',
    description: '查询演练链路状态。云端→浏览器对抗舱链路已接线,但 mcp 进程读不到浏览器实时态势(进程隔离)——返回已转发条数(观测用);实时态势请依赖剧本 seed 与 inject_event 输入,执行结果用 get_scene_command_status 查 ack。',
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
    description: '注入对抗事件(对抗 agent 用,如风向突变/爆炸/二次被困)。经 /scene-events 转发至浏览器对抗舱执行(confront-store.appendInject)。前置:对抗舱处于 running;未开启时执行失败(ack=error)。',
    inputSchema: {
      type: 'object',
      properties: {
        drill_id: { type: 'string', description: '演练会话 id' },
        event: {
          type: 'object',
          description: '事件载荷(自由结构,常见字段:type=wind_shift/explosion/secondary_trapped, description=事件描述(展示用), payload={...})',
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
    name: 'query_scene_facilities',
    description: '查询建筑内部消防设施数量(按类型/楼层分组)——数据来自 3D 场景包(浏览器在线解析场景树),数据库无此粒度。返回 total/fireByTypeLabel(中文类型→数量)/fireByFloor(楼层→数量)/floors。调用后需用 get_scene_command_status(cmd_id) 查询结果(浏览器在线解析并回传)。可传 floor/type 过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        floor: { type: 'string', description: '楼层过滤(楼层标签子串,如 "5F"/"B1";可选)' },
        type: { type: 'string', description: '类型过滤(类型名或中文标签子串,如 "IndoorFireHydrant"/"消火栓";可选)' },
      },
    },
  },
  {
    name: 'report_decision',
    description: '上报主智能体决策。经 /scene-events 转发至浏览器对抗舱执行(confront-store.appendAdjust,作为动态调整进入对抗时间线,供指挥员响应与评估)。前置:对抗舱处于 running;未开启时执行失败(ack=error)。',
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
        text: `已下发 focus_objects:${action} (cmd_id=${cmd.id})。可用 get_scene_command_status(cmd_id) 查询执行回执。`,
      }],
    };
  }

  if (name === 'focus_floors') {
    const storyIds = Array.isArray(args.story_ids) ? (args.story_ids as unknown[]).map(String) : [];
    const flyToFirst = args.fly_to_first !== false; // 缺省/显式 true 均飞向;显式 false 仅独显
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'focus_floors',
      args: { story_ids: storyIds, fly_to_first: flyToFirst },
      ts: Date.now(),
    };
    publishCommand(cmd);
    const floorAction = storyIds.length === 0 ? '已恢复全楼层' : `已隔离 ${storyIds.length} 层${flyToFirst ? '并聚焦' : ''}`;
    return {
      content: [{
        type: 'text',
        text: `已下发 focus_floors:${floorAction} (cmd_id=${cmd.id})。可用 get_scene_command_status(cmd_id) 查询执行回执。`,
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
        text: `已下发 fly_to -> ${target} (cmd_id=${cmd.id}):命令经 /scene-events 推送至场景页面。可用 get_scene_command_status(cmd_id) 查询执行回执(浏览器在线执行后返回 ok/error)。`,
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
    const layer = args.layer != null ? String(args.layer) : '';
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'gis_fly_to',
      args: {
        lat,
        lng,
        ...(Number.isFinite(zoom) ? { zoom } : {}),
        ...(label ? { label } : {}),
        ...(layer ? { layer } : {}),
      },
      ts: Date.now(),
    };
    publishCommand(cmd);
    return {
      content: [{
        type: 'text',
        text: `已下发 gis_fly_to -> ${label || `${lng},${lat}`} (cmd_id=${cmd.id}):命令经 /scene-events 推送至态势总览 GIS 地图。可用 get_scene_command_status(cmd_id) 查询执行回执。`,
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
        text: `已下发 show_route(${routes.length} 站) (cmd_id=${cmd.id}):命令经 /scene-events 推送至 2D 态势总览渲染。可用 get_scene_command_status(cmd_id) 查询执行回执。`,
      }],
    };
  }

  // ─── 业务查询:对接 znya /api/business/*(经 web BFF,x-app-key 鉴权)───
  if (name === 'get_scene_command_status') {
    const cmdId = String(args.cmd_id ?? '').trim();
    if (!cmdId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'get_scene_command_status 缺少 cmd_id:需提供下发命令返回的 cmd_xxx id' }],
      };
    }
    const st = getCommandStatus(cmdId);
    if (!st) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ cmd_id: cmdId, status: 'not_found', message: '未执行或已过期(浏览器可能离线/命令未被消费)' }, null, 2) }],
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ cmd_id: st.cmdId, tool: st.tool, status: st.status, message: st.message ?? null, result: st.result ?? null, ts: st.ts }, null, 2) }],
    };
  }

  if (name === 'query_scene_facilities') {
    // 浏览器在线解析场景包统计;结果经 ack 回传,agent 用 get_scene_command_status 查。
    const args2: Record<string, unknown> = {};
    if (args.floor != null) args2.floor = String(args.floor);
    if (args.type != null) args2.type = String(args.type);
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'query_scene_facilities',
      args: args2,
      ts: Date.now(),
    };
    publishCommand(cmd);
    return {
      content: [{
        type: 'text',
        text: `已下发 query_scene_facilities (cmd_id=${cmd.id})。请调用 get_scene_command_status(cmd_id) 获取统计结果(浏览器在线解析场景包后回传;若 status=not_found 说明浏览器未加载场景或未在线)。`,
      }],
    };
  }

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

  // ─── 推演控制(云端 → 浏览器对抗舱;记日志 + 转发,执行结果查 ack)───
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
