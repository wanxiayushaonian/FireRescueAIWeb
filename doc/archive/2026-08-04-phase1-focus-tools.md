# Phase 1 — 场景聚焦工具 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 0 `fly_to` 之上,新增 `list_floors`(读)+ `focus_objects` / `focus_floors`(写)三个 agent 工具。

**Architecture:** 沿用 Phase 0 端到端模式:写工具走 `MCP handleToolCall → publishCommand → /scene-events → 前端 dispatch → handler → sdk`;读工具走 `MCP → BFF /api/ustudio/tree`。

**Tech Stack:** TypeScript、Next.js 16(route handler)、MCP SDK v1(SSE)、vitest。

## Global Constraints

- **MCP SDK 用 v1**(`@modelcontextprotocol/sdk` SSE 传输),与 Phase 0 一致。
- **测试布局**:根 vitest 只覆盖 `lib/**/__tests__`(environment=node);`mcp-server` 是独立子包,验证须 `cd mcp-server && npx vitest run` + `npx tsc --noEmit`;根类型检查 `npm run typecheck`。两端的 tsc 互不包含。
- **命令链路不改**:写工具复用现有 `publishCommand` / `dispatch(cmd, sdk)` / handler `(args, sdk)` 签名,不动 `SceneCommandBridge` 的时序逻辑(Phase 0 已修)。
- **TDD**:每个任务先写失败测试,看它失败,再写最小实现,看它通过,再 commit。
- **Conventional Commits**:`feat(mcp)` / `feat(scene-bus)` 等。
- **node 经 nvm**:非交互 shell 须先 `source ~/.nvm/nvm.sh`。
- **MVP 边界**:`focus_objects` 多对象 = 高亮全部 + 飞向第一个(sdk 无现成"框住多对象");精确包围盒框住留作后续(需扩展 runtime/ssp,超出本计划)。

## File Structure

| 文件 | 职责 | 任务 |
|---|---|---|
| `mcp-server/src/bff-client.ts` | 加 `getSceneTree`(带 cache)+ `getFloorList` + `collectFloors`;`getFireDeviceList` 改用 `getSceneTree` | T1 |
| `mcp-server/src/tools.ts` | 删本地 deviceCache;`handleToolCall` 加 `list_floors`/`focus_objects`/`focus_floors` 分支;`TOOLS` 加 3 项 | T1/T3/T5 |
| `mcp-server/src/__tests__/tools.test.ts` | 3 工具 + cache 共享测试 | T1/T3/T5 |
| `lib/scene-command-bus/types.ts` | `SceneSdkLike` 扩展 `heighLight` / `cancelHeighLight` / `setViewMode` 最小签名 | T2/T4 |
| `lib/scene-command-bus/handlers.ts` | `registerDefaultTools` 加 `focus_objects` / `focus_floors` handler | T2/T4 |
| `lib/scene-command-bus/__tests__/handlers.test.ts` | 两个 handler 的 dispatch 测试 | T2/T4 |
| `lib/scene-command-bus/scene-tree.ts`(新) | 前端按 sceneId 拉取 `/api/ustudio/tree` 并短缓存,供 `focus_floors` 用 | T4 |

---

## Task 1: `list_floors` 读工具 + tree cache 共享(MCP)

**Files:**
- Modify: `mcp-server/src/bff-client.ts`
- Modify: `mcp-server/src/tools.ts`
- Test: `mcp-server/src/__tests__/tools.test.ts`

**Interfaces:**
- Produces: `getSceneTree({sceneId})` / `getFloorList({sceneId})` (bff-client),`list_floors` 工具(tools);`__resetTreeCacheForTest()`(bff-client,替代 tools 的 `__resetDeviceCacheForTest`)。

- [ ] **Step 1: 写失败测试**(`tools.test.ts` 追加)

```ts
import { __resetTreeCacheForTest } from '../bff-client.js';
// beforeEach 里把 __resetDeviceCacheForTest() 换成 __resetTreeCacheForTest()

it('list_floors 返回楼层清单(id/name)', async () => {
  const res = await handleToolCall('list_floors', {});
  const payload = JSON.parse(res.content[0].text);
  expect(Array.isArray(payload.floors)).toBe(true);
  expect(payload.floors.length).toBe(2);
  expect(payload.floors[0]).toEqual({ id: 'f1', name: '一层' });
});

it('list_fire_devices 与 list_floors 共享 tree cache(BFF tree 只拉一次)', async () => {
  await handleToolCall('list_fire_devices', {});
  await handleToolCall('list_floors', {});
  expect(getFireDeviceList).toHaveBeenCalledTimes(1); // mock 里 getFireDeviceList 内部调 getSceneTree
});
```

同步更新 `bff-client.js` 的 mock(`tools.test.ts` 顶部):`getFloorList` 加 mock,`getSceneOverview` 不变。tree mock 数据需含楼层节点(type=`Story`)和设备节点(type=`StandaloneSmokeAlarm`)。

- [ ] **Step 2: 跑测试看失败**

```bash
cd mcp-server && npx vitest run src/__tests__/tools.test.ts
```
Expected: `list_floors` 相关用例 FAIL(`unknown tool: list_floors` 或 `__resetTreeCacheForTest` 未导出)。

- [ ] **Step 3: 实现 bff-client(`getSceneTree` + cache + `getFloorList`)**

在 `bff-client.ts` 加(紧邻 `getFireDeviceList`):

```ts
const STORY_PATTERN = /story|floor|楼层|层$/i;

export type FloorNode = { id: string; name: string };

const treeCache = new Map<string, { at: number; tree: SceneTreeNode }>();
const TREE_CACHE_TTL_MS = 5 * 60 * 1000;

/** 拉场景树并短缓存;getFireDeviceList / getFloorList 共享,避免重复拉 14MB tree。 */
export async function getSceneTree(params: { sceneId: string }): Promise<SceneTreeNode> {
  const hit = treeCache.get(params.sceneId);
  if (hit && Date.now() - hit.at < TREE_CACHE_TTL_MS) return hit.tree;
  const res = await bffFetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(params.sceneId)}`);
  const tree = (await res.json()) as SceneTreeNode;
  treeCache.set(params.sceneId, { at: Date.now(), tree });
  return tree;
}

export function __resetTreeCacheForTest(): void {
  treeCache.clear();
}

function collectFloors(node: SceneTreeNode, out: FloorNode[]): void {
  if (STORY_PATTERN.test(node.type)) out.push({ id: node.id, name: node.name });
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectFloors(child, out);
  }
}

export async function getFloorList(params: { sceneId: string }): Promise<FloorNode[]> {
  const tree = await getSceneTree(params);
  const out: FloorNode[] = [];
  collectFloors(tree, out);
  return out;
}
```

把原 `getFireDeviceList` 改为复用 `getSceneTree`(去掉它内部的 fetch,改为 `const tree = await getSceneTree(params);`)。

- [ ] **Step 4: 实现 tools(`list_floors` 分支 + 去 deviceCache)**

`tools.ts`:删掉本地 `deviceCache` / `getDevicesCached` / `__resetDeviceCacheForTest`;`list_fire_devices` 分支直接 `await getFireDeviceList({ sceneId })`(它内部走共享 cache)。`TOOLS` 加:

```ts
{
  name: 'list_floors',
  description: '查询当前场景的楼层清单(含 id/name,id 供 focus_floors 使用)',
  inputSchema: { type: 'object', properties: {} },
},
```

`handleToolCall` 加分支(放在 `list_fire_devices` 之后):

```ts
if (name === 'list_floors') {
  const floors = await getFloorList({ sceneId });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ total: floors.length, floors }, null, 2),
    }],
  };
}
```

import 改为 `import { getSceneOverview, getFireDeviceList, getFloorList } from './bff-client.js';`。

- [ ] **Step 5: 跑测试看通过**

```bash
cd mcp-server && npx vitest run src/__tests__/tools.test.ts && npx tsc --noEmit
```
Expected: PASS(含新用例),tsc 无错。

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/bff-client.ts mcp-server/src/tools.ts mcp-server/src/__tests__/tools.test.ts
git commit -m "feat(mcp): add list_floors tool with shared tree cache"
```

---

## Task 2: `focus_objects` 前端 handler

**Files:**
- Modify: `lib/scene-command-bus/types.ts`
- Modify: `lib/scene-command-bus/handlers.ts`
- Test: `lib/scene-command-bus/__tests__/handlers.test.ts`

**Interfaces:**
- Consumes: `SceneCommand { tool:'focus_objects', args:{ ids: string[] } }`、`SceneSdkLike.heighLight` / `fly` / `cancelHeighLight`。
- Produces: 注册名 `focus_objects`。

- [ ] **Step 1: 写失败测试**(`handlers.test.ts` 追加)

```ts
it('focus_objects 空 ids → 调 cancelHeighLight 清除', async () => {
  __resetForTest();
  const sdk = { fly: vi.fn(), heighLight: vi.fn(), cancelHeighLight: vi.fn() } as never;
  registerDefaultTools(sdk);
  await dispatch({ id: '1', tool: 'focus_objects', args: { ids: [] }, ts: 0 }, sdk);
  expect(sdk.cancelHeighLight).toHaveBeenCalled();
  expect(sdk.heighLight).not.toHaveBeenCalled();
});

it('focus_objects 多 ids → 高亮全部 + 飞向第一个', async () => {
  __resetForTest();
  const fly = vi.fn();
  const heighLight = vi.fn();
  const sdk = { fly, heighLight, cancelHeighLight: vi.fn() } as never;
  registerDefaultTools(sdk);
  await dispatch({ id: '1', tool: 'focus_objects', args: { ids: ['a', 'b'] }, ts: 0 }, sdk);
  expect(heighLight).toHaveBeenCalledWith('a', expect.anything());
  expect(heighLight).toHaveBeenCalledWith('b', expect.anything());
  expect(fly).toHaveBeenCalledWith('a');
});
```

- [ ] **Step 2: 跑测试看失败**

```bash
source ~/.nvm/nvm.sh && npx vitest run lib/scene-command-bus/__tests__/handlers.test.ts
```
Expected: FAIL(`unknown tool: focus_objects`,dispatch 静默跳过)。

- [ ] **Step 3: 扩展 `SceneSdkLike`**(`types.ts`)

```ts
export type SceneSdkLike = {
  fly: (target: string | number) => unknown;
  heighLight: (id: string, color?: string | number) => unknown;
  cancelHeighLight: () => unknown;
  [k: string]: unknown;
};
```

- [ ] **Step 4: 实现 handler**(`handlers.ts`,在 `fly_to` 之后追加注册)

```ts
const FOCUS_HIGHLIGHT_COLOR = '#f87171';

registerSceneTool('focus_objects', async (args, sdk) => {
  const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String) : [];
  if (ids.length === 0) {
    sdk.cancelHeighLight();
    return;
  }
  for (const id of ids) sdk.heighLight(id, FOCUS_HIGHLIGHT_COLOR);
  await sdk.fly(ids[0]);
});
```

- [ ] **Step 5: 跑测试看通过**

```bash
source ~/.nvm/nvm.sh && npx vitest run lib/scene-command-bus/__tests__/handlers.test.ts
```
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add lib/scene-command-bus/types.ts lib/scene-command-bus/handlers.ts lib/scene-command-bus/__tests__/handlers.test.ts
git commit -m "feat(scene-bus): add focus_objects handler"
```

---

## Task 3: `focus_objects` MCP 工具(写)

**Files:**
- Modify: `mcp-server/src/tools.ts`
- Test: `mcp-server/src/__tests__/tools.test.ts`

**Interfaces:**
- Produces: `focus_objects` 工具,publish `{ tool:'focus_objects', args:{ ids } }`。

- [ ] **Step 1: 写失败测试**(`tools.test.ts` 追加)

```ts
it('focus_objects 发布命令并返回已下发', async () => {
  const res = await handleToolCall('focus_objects', { ids: ['d1', 'd2'] });
  expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
    tool: 'focus_objects', args: { ids: ['d1', 'd2'] },
  }));
  expect(res.content[0].text).toContain('已下发');
});

it('focus_objects 空 ids 也发布(清除命令)', async () => {
  await handleToolCall('focus_objects', { ids: [] });
  expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
    tool: 'focus_objects', args: { ids: [] },
  }));
});
```

- [ ] **Step 2: 跑测试看失败** — `cd mcp-server && npx vitest run src/__tests__/tools.test.ts`,FAIL(`unknown tool: focus_objects`)。

- [ ] **Step 3: 实现**(`tools.ts`):`TOOLS` 加

```ts
{
  name: 'focus_objects',
  description: '高亮聚焦一组场景对象(设备 id 来自 list_fire_devices),并飞向首个;空数组清除高亮',
  inputSchema: {
    type: 'object',
    properties: { ids: { type: 'array', items: { type: 'string' }, description: '对象 id 列表' } },
    required: ['ids'],
  },
},
```

`handleToolCall` 加分支(在 `fly_to` 旁):

```ts
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
      text: `已下发 focus_objects:${action}。命令经 /scene-events 推送;仅当页面在线且 SDK 就绪时生效,通道为单向无回执。`,
    }],
  };
}
```

- [ ] **Step 4: 跑测试看通过** — `cd mcp-server && npx vitest run src/__tests__/tools.test.ts && npx tsc --noEmit`,PASS。

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools.ts mcp-server/src/__tests__/tools.test.ts
git commit -m "feat(mcp): add focus_objects write tool"
```

---

## Task 4: `focus_floors` 前端 handler(含 tree 拉取)

**Files:**
- Create: `lib/scene-command-bus/scene-tree.ts`
- Modify: `lib/scene-command-bus/types.ts`、`lib/scene-command-bus/handlers.ts`
- Test: `lib/scene-command-bus/__tests__/handlers.test.ts`

**Interfaces:**
- Consumes: `window.__sceneId`、`/api/ustudio/tree`、`SceneSdkLike.setViewMode`。
- Produces: 注册名 `focus_floors`;`getSceneTreeForView(sceneId)`(scene-tree.ts)。

- [ ] **Step 1: 写失败测试**(`handlers.test.ts` 追加;用 `vi.stubGlobal('fetch', ...)`)

```ts
it('focus_floors 非空 story_ids → 拉 tree + setViewMode 传 storyIds', async () => {
  __resetForTest();
  const setViewMode = vi.fn().mockResolvedValue(undefined);
  const sdk = { fly: vi.fn(), setViewMode } as never;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ type: 'Building', children: [{ type: 'Story', id: 's1', name: '一层' }] }), {
      headers: { 'content-type': 'application/json' },
    }),
  ));
  registerDefaultTools(sdk);
  await dispatch({ id: '1', tool: 'focus_floors', args: { story_ids: ['s1'] }, ts: 0 }, sdk);
  expect(setViewMode).toHaveBeenCalled();
  const callArgs = setViewMode.mock.calls[0];
  expect(callArgs[2]).toEqual(['s1']); // 第三参 = storyIds
  vi.unstubAllGlobals();
});

it('focus_floors 空 story_ids → setViewMode 传空(恢复全楼层)', async () => {
  __resetForTest();
  const setViewMode = vi.fn().mockResolvedValue(undefined);
  const sdk = { fly: vi.fn(), setViewMode } as never;
  registerDefaultTools(sdk);
  await dispatch({ id: '1', tool: 'focus_floors', args: { story_ids: [] }, ts: 0 }, sdk);
  expect(setViewMode).toHaveBeenCalled();
  expect(setViewMode.mock.calls[0][2]).toEqual([]);
});
```

- [ ] **Step 2: 跑测试看失败** — `source ~/.nvm/nvm.sh && npx vitest run lib/scene-command-bus/__tests__/handlers.test.ts`,FAIL(unknown tool)。

- [ ] **Step 3: 新建 `lib/scene-command-bus/scene-tree.ts`**

```ts
type SceneTreeNode = { id: string; name: string; type: string; children?: SceneTreeNode[] };

const cache = new Map<string, { at: number; tree: SceneTreeNode }>();
const TTL_MS = 60_000;

/** 前端按 sceneId 拉场景树并短缓存,供 setViewMode 等 API 使用。 */
export async function getSceneTreeForView(sceneId: string): Promise<SceneTreeNode> {
  const hit = cache.get(sceneId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tree;
  const res = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`加载场景树失败: ${res.status}`);
  const tree = (await res.json()) as SceneTreeNode;
  cache.set(sceneId, { at: Date.now(), tree });
  return tree;
}

export function __resetSceneTreeCacheForTest(): void {
  cache.clear();
}
```

- [ ] **Step 4: 扩展 `SceneSdkLike`**(`types.ts` 加成员)

```ts
setViewMode: (params: unknown, treeData: unknown, storyIds?: string[]) => unknown;
```

- [ ] **Step 5: 实现 handler**(`handlers.ts` 追加)

```ts
import { getSceneTreeForView } from './scene-tree';

registerSceneTool('focus_floors', async (args, sdk) => {
  const storyIds = Array.isArray(args.story_ids) ? (args.story_ids as unknown[]).map(String) : [];
  const sceneId = typeof window !== 'undefined' ? window.__sceneId : undefined;
  if (!sceneId) {
    console.warn('[scene-bus] focus_floors: 场景未就绪(window.__sceneId 空)');
    return;
  }
  const tree = await getSceneTreeForView(sceneId);
  await sdk.setViewMode({ mode: 'story' }, tree, storyIds);
});
```

> `setViewMode` 的第一参 `params`(视图模式)取值在实现/验收时按引擎确认;此处先用 `{ mode: 'story' }` 占位语义,若引擎要求不同字段,验收步骤里修正(仅改这一个字段,不破坏契约)。

- [ ] **Step 6: 跑测试看通过** — `npx vitest run lib/scene-command-bus/__tests__/handlers.test.ts`,PASS。

- [ ] **Step 7: Commit**

```bash
git add lib/scene-command-bus/scene-tree.ts lib/scene-command-bus/types.ts lib/scene-command-bus/handlers.ts lib/scene-command-bus/__tests__/handlers.test.ts
git commit -m "feat(scene-bus): add focus_floors handler with tree fetch"
```

---

## Task 5: `focus_floors` MCP 工具(写)

**Files:**
- Modify: `mcp-server/src/tools.ts`
- Test: `mcp-server/src/__tests__/tools.test.ts`

- [ ] **Step 1: 写失败测试**(`tools.test.ts` 追加)

```ts
it('focus_floors 发布命令并返回已下发', async () => {
  const res = await handleToolCall('focus_floors', { story_ids: ['s1'] });
  expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
    tool: 'focus_floors', args: { story_ids: ['s1'] },
  }));
  expect(res.content[0].text).toContain('已下发');
});
```

- [ ] **Step 2: 跑测试看失败** — `cd mcp-server && npx vitest run src/__tests__/tools.test.ts`,FAIL。

- [ ] **Step 3: 实现**(`tools.ts`):`TOOLS` 加

```ts
{
  name: 'focus_floors',
  description: '隔离显示选中的楼层(其余层隐藏);楼层 id 来自 list_floors;空数组恢复全楼层',
  inputSchema: {
    type: 'object',
    properties: { story_ids: { type: 'array', items: { type: 'string' }, description: '楼层 id 列表' } },
    required: ['story_ids'],
  },
},
```

`handleToolCall` 加分支:

```ts
if (name === 'focus_floors') {
  const storyIds = Array.isArray(args.story_ids) ? (args.story_ids as unknown[]).map(String) : [];
  const cmd: SceneCommand = {
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tool: 'focus_floors',
    args: { story_ids: storyIds },
    ts: Date.now(),
  };
  publishCommand(cmd);
  const action = storyIds.length === 0 ? '已恢复全楼层' : `已隔离 ${storyIds.length} 层`;
  return {
    content: [{
      type: 'text',
      text: `已下发 focus_floors:${action}。命令经 /scene-events 推送;仅当页面在线且 SDK 就绪时生效,通道为单向无回执。`,
    }],
  };
}
```

- [ ] **Step 4: 跑测试看通过** — `cd mcp-server && npx vitest run src/__tests__/tools.test.ts && npx tsc --noEmit`,PASS。

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools.ts mcp-server/src/__tests__/tools.test.ts
git commit -m "feat(mcp): add focus_floors write tool"
```

---

## Task 6: 集成验收

**Files:** 无新代码,只验证 + 记录。

- [ ] **Step 1: 全量自动化验证**

```bash
source ~/.nvm/nvm.sh
cd /home/ljb/program/FireRescueAI/web
npm run typecheck && npx vitest run
cd mcp-server && npx tsc --noEmit && npx vitest run
```
Expected:根 tsc 无错;根 vitest 全绿(含新 handlers/scene-tree 测试);mcp tsc 无错;mcp vitest 全绿(含 3 工具测试)。

- [ ] **Step 2: 手动验收清单(本地 `npm run dev` + `mcp-server` 都起)**

用 MCP inspector 或 `probe-client.mjs` 连本地 mcp,确认 `listTools()` 含 `list_floors` / `focus_objects` / `focus_floors`:
- `list_floors` → 返回真实楼层 `id/name`
- `focus_objects({ids:[某设备 id]})` → 浏览器场景高亮 + 飞向
- `focus_objects({ids:[]})` → 清除高亮
- `focus_floors({story_ids:[某层 id]})` → 场景隔离该层(若 `setViewMode` params 不对,按引擎返回修正 Task 4 Step 5 的 `{ mode: 'story' }`)
- `focus_floors({story_ids:[]})` → 恢复全楼层

- [ ] **Step 3: Commit 验收记录(可选)**

把 `setViewMode` 实际生效的 params 值、真实楼层/设备数据形态补回 `docs/superpowers/specs/2026-08-04-phase1-focus-tools-design.md` 的"已知数据形态"或单独 `mcp-server/README.md`。

```bash
git add docs/  # 或 README
git commit -m "docs: record Phase 1 acceptance + setViewMode params"
```

---

## Self-Review(已做)

- **Spec 覆盖**:`list_floors`(T1)、`focus_objects` 高亮+飞/清除(T2/T3)、`focus_floors` 隔离/恢复(T4/T5)、tree cache 共享(T1)、错误处理(handler 内 try 已由 dispatch 提供;无效 id 跳过由 sdk 行为决定)、测试(MCP+前端)、验收(T6)—— spec 各节均有任务对应。
- **占位符**:无 TBD/TODO。`setViewMode` 的 `params` 用 `{ mode: 'story' }` 作语义占位,T6 Step 2 明确"按引擎返回修正该字段"——是有界的实现期确认点,非空白。
- **类型一致**:`SceneSdkLike.heighLight` / `cancelHeighLight` / `setViewMode` 在 T2/T4 定义后,T2/T4 handler 与测试调用一致;`focus_objects` args `{ids}`、`focus_floors` args `{story_ids}` 在 MCP(T3/T5)与前端(T2/T4)两端命名一致。
- **范围**:单个实施计划可覆盖;`show_route`/`draw_zone`、精确包围盒框住为非目标。
