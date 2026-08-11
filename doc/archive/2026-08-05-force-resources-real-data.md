# 执勤力量真实数据接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** znya 后端新增 `fire_force_items` 执勤力量明细模块并回填 14 站 demo,web 数据访问层接真实数据,ForceResourcePanel 从 mock 切换为真实(znya)。

**Architecture:** znya(`/home/ljb/program/FireRescueAI/znya_jjxf119/server`,独立 git 仓库)按 `fire_facilities` 同构模式加 `fire_force_items` 表(ref_type+ref_id 挂载 `fire_station`,`create_crud_router` 生成 CRUD) + Alembic migration + seed 脚本;web 端新增 `lib/force-mapper.ts` 纯函数映射层(可测)+ `src/api/force.ts` 数据访问层(调 `/api/business/*` BFF 代理),ForceResourcePanel 切换数据源。

**Tech Stack:** znya: Python 3.12 / FastAPI / SQLAlchemy 2.0 / Alembic / pytest(uv);web: Next.js 16 / TypeScript / vitest。

## Global Constraints

- znya 与 web 是**两个独立 git 仓库**,分别在各自目录 commit。
- znya 测试:PG 测试库 `fire_rescue_test`(tests/conftest.py 自动建),新模型必须在 `tests/conftest.py` 的 `from app.models import (...)` 列表加入,否则建不了表。
- `app/models/` 是命名空间包(无 `__init__.py`),新模型直接放 `app/models/fire_force_item.py`。
- `create_crud_router` 需 `search_fields=("name",)`(模型无 `ai_description` 列,禁用默认搜索字段)。
- web vitest include 仅 `lib/**/__tests__/**`;映射/聚合纯函数放 `lib/` 才可测。
- web `/api/business/*` 代理已通(service JWT + 404 补尾斜杠),前端无需 znya token。
- mock 文件 `src/mock/stations.ts` 保留(其它组件/回退用);状态演示下拉与 DemoTag 保留。
- 语义:znya 明细字段 `force_type` 值用中文 `人员/车辆/装备`;`status` 值用 `在位/出警/维保/正常/告警/离线`;`station_type` 用 mock 的 5 类中文值(救援大队/救援站/政府专职站/企业专职站/微型消防站),UI 树分类天然一致。

---

### Task 1: znya FireForceItem 模型 + Schema + 模型测试

**Files:**
- Create: `app/models/fire_force_item.py`
- Create: `app/schemas/fire_force_item.py`
- Modify: `tests/conftest.py`(import 列表加 `fire_force_item`)
- Create: `tests/test_fire_force_items.py`

**Interfaces:**
- Produces: 模型 `FireForceItem`(列 ref_type/ref_id/force_type/name/subtype/status,继承 TimestampedModel);schema `FireForceItemCreate/FireForceItemUpdate/FireForceItemResponse`。Task 2/3 依赖这些类。

- [ ] **Step 1: 写失败测试(模型字段往返)**

`tests/test_fire_force_items.py`:
```python
"""执勤力量明细实体：model 字段往返 + schema 校验。"""
import pytest
import pydantic

from app.models.fire_force_item import FireForceItem
from app.schemas.fire_force_item import FireForceItemCreate, FireForceItemUpdate


def test_fire_force_item_model_fields(db_session):
    """核心列往返 + 默认 status。"""
    item = FireForceItem(
        ref_type="fire_station", ref_id="st-001", force_type="车辆",
        name="水罐车 A-001", subtype="水罐车", status="在位",
    )
    db_session.add(item); db_session.commit(); db_session.refresh(item)
    assert item.id and item.ref_type == "fire_station"
    assert item.force_type == "车辆" and item.subtype == "水罐车"
    assert item.deleted_at is None  # TimestampedModel mixin


def test_fire_force_item_create_schema_default_status():
    """status 缺省 → 在位。"""
    payload = FireForceItemCreate(
        ref_type="fire_station", ref_id="st-001", force_type="装备",
        name="灭火防护服 ZJ-001", subtype="基本防护",
    )
    assert payload.status == "在位"


def test_fire_force_item_update_schema_all_optional():
    """Update 全字段 Optional。"""
    u = FireForceItemUpdate(status="出警")
    assert u.status == "出警" and u.name is None
    # 全空合法（整字段替换语义由 CRUD 层保证，schema 层允许空）
    assert FireForceItemUpdate() is not None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run pytest tests/test_fire_force_items.py -v`
Expected: FAIL(`ModuleNotFoundError: app.models.fire_force_item`)

- [ ] **Step 3: 写模型与 schema**

`app/models/fire_force_item.py`:
```python
"""执勤力量明细（人员/车辆/装备行），ref_type+ref_id 挂载 fire_station。

与 fire_facilities 同构：ref_type='fire_station'、ref_id=fire_stations.id。
"""
from sqlalchemy import Column, Index, String

from app.models.base import TimestampedModel


class FireForceItem(TimestampedModel):
    __tablename__ = "fire_force_items"
    __table_args__ = (
        Index("ix_fire_force_items_ref_type", "ref_type"),
        Index("ix_fire_force_items_ref_id", "ref_id"),
        Index("ix_fire_force_items_force_type", "force_type"),
        Index("ix_fire_force_items_status", "status"),
        Index("ix_fire_force_items_deleted_at", "deleted_at"),
    )

    ref_type = Column(String(20), nullable=False)       # 'fire_station'
    ref_id = Column(String(36), nullable=False)         # fire_stations.id
    force_type = Column(String(20), nullable=False)     # '人员'|'车辆'|'装备'
    name = Column(String(200), nullable=False)          # 名称/编号(水罐车 A-001)
    subtype = Column(String(100), nullable=False)       # 子类(水罐车/干部/基本防护…)
    status = Column(String(20), nullable=False, default="在位")  # 在位/出警/维保/正常/告警/离线
```

`app/schemas/fire_force_item.py`:
```python
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class FireForceItemCreate(BaseModel):
    ref_type: str
    ref_id: str
    force_type: str
    name: str
    subtype: str
    status: str = "在位"


class FireForceItemUpdate(BaseModel):
    ref_type: Optional[str] = None
    ref_id: Optional[str] = None
    force_type: Optional[str] = None
    name: Optional[str] = None
    subtype: Optional[str] = None
    status: Optional[str] = None


class FireForceItemResponse(BaseModel):
    id: str
    ref_type: str
    ref_id: str
    force_type: str
    name: str
    subtype: str
    status: str
    created_by: Optional[str]
    updated_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

`tests/conftest.py` 的 import 列表 `from app.models import (...)` 中追加 `fire_force_item`(在 `fire_station` 后)。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run pytest tests/test_fire_force_items.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit(znya 仓库)**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119
git add server/app/models/fire_force_item.py server/app/schemas/fire_force_item.py server/tests/conftest.py server/tests/test_fire_force_items.py
git commit -m "feat(force): 执勤力量明细 FireForceItem 模型与 schema(TDD)"
```

---

### Task 2: znya CRUD API + main 注册 + Alembic migration + 契约测试

**Files:**
- Create: `app/api/fire_force_items.py`
- Modify: `main.py`(include_router)
- Create: `alembic/versions/xxxx_create_fire_force_items_table.py`
- Modify: `tests/test_fire_force_items.py`(追加 CRUD 契约测试)

**Interfaces:**
- Consumes: Task 1 的模型/schema。
- Produces: `GET /fire-force-items/` 列表(支持 `ref_type/ref_id/force_type/status` 过滤 + 分页)、`POST/GET one/PUT/DELETE`。Task 3 seed 与 Task 5 web 依赖此 API。

- [ ] **Step 1: 写失败测试(CRUD 契约)**

`tests/test_fire_force_items.py` 追加:
```python
PAYLOAD = {
    "ref_type": "fire_station", "ref_id": "st-001", "force_type": "车辆",
    "name": "水罐车 A-001", "subtype": "水罐车", "status": "在位",
}


def test_create_and_get(client, authed):
    r = client.post("/fire-force-items/", json=PAYLOAD)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["force_type"] == "车辆" and body["status"] == "在位"
    assert body["created_by"] is not None

    got = client.get(f"/fire-force-items/{body['id']}")
    assert got.status_code == 200 and got.json()["name"] == "水罐车 A-001"


def test_list_filters(client, authed):
    client.post("/fire-force-items/", json=PAYLOAD)
    client.post("/fire-force-items/", json={**PAYLOAD, "force_type": "装备", "name": "灭火防护服 ZJ-001", "subtype": "基本防护"})
    client.post("/fire-force-items/", json={**PAYLOAD, "name": "水罐车 B-002", "status": "出警"})

    assert client.get("/fire-force-items/").json()["total"] == 3
    assert client.get("/fire-force-items/?ref_id=st-001").json()["total"] == 3
    assert client.get("/fire-force-items/?force_type=装备").json()["total"] == 1
    assert client.get("/fire-force-items/?status=出警").json()["total"] == 1
    assert client.get("/fire-force-items/?page_size=2").json()["total"] == 3


def test_update_and_delete(client, authed):
    body = client.post("/fire-force-items/", json=PAYLOAD).json()
    r = client.put(f"/fire-force-items/{body['id']}", json={"status": "维保"})
    assert r.status_code == 200 and r.json()["status"] == "维保"

    d = client.delete(f"/fire-force-items/{body['id']}")
    assert d.status_code == 200
    assert client.get(f"/fire-force-items/{body['id']}").status_code == 404
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run pytest tests/test_fire_force_items.py -v`
Expected: CRUD 三个测试 FAIL(404,路由未注册;或 500,表不存在)

- [ ] **Step 3: 写 API 模块 + 注册 + migration**

`app/api/fire_force_items.py`:
```python
"""执勤力量明细 CRUD 路由（由通用工厂生成）。"""
from app.api.crud_factory import create_crud_router
from app.models.fire_force_item import FireForceItem
from app.schemas.fire_force_item import (
    FireForceItemCreate, FireForceItemUpdate, FireForceItemResponse,
)

router = create_crud_router(
    model=FireForceItem,
    create_schema=FireForceItemCreate,
    update_schema=FireForceItemUpdate,
    response_schema=FireForceItemResponse,
    prefix="/fire-force-items",
    tags=["fire-force-items"],
    search_fields=("name",),  # 模型无 ai_description 列，禁用默认搜索字段
)
```

`main.py`:`from app.api import ...` 与 `include_router` 区追加:
```python
app.include_router(fire_force_items.router)
```
(放在 `fire_stations.router` include 之后,并同步加 import。)

migration:先查当前 head:
Run: `cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run alembic heads`
记下 head revision ID(记为 `<HEAD>`),然后新建 `alembic/versions/xxxx_create_fire_force_items_table.py`(文件名以时间戳+短 id,如 `2f3a4b5c6d7e_create_fire_force_items_table.py`):
```python
"""create fire_force_items table

Revision ID: <短id>
Revises: <HEAD>
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '<短id>'
down_revision: Union[str, Sequence[str], None] = '<HEAD>'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('fire_force_items',
        sa.Column('ref_type', sa.String(length=20), nullable=False),
        sa.Column('ref_id', sa.String(length=36), nullable=False),
        sa.Column('force_type', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('subtype', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('updated_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fire_force_items_ref_type', 'fire_force_items', ['ref_type'], unique=False)
    op.create_index('ix_fire_force_items_ref_id', 'fire_force_items', ['ref_id'], unique=False)
    op.create_index('ix_fire_force_items_force_type', 'fire_force_items', ['force_type'], unique=False)
    op.create_index('ix_fire_force_items_status', 'fire_force_items', ['status'], unique=False)
    op.create_index('ix_fire_force_items_deleted_at', 'fire_force_items', ['deleted_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_fire_force_items_deleted_at', table_name='fire_force_items')
    op.drop_index('ix_fire_force_items_status', table_name='fire_force_items')
    op.drop_index('ix_fire_force_items_force_type', table_name='fire_force_items')
    op.drop_index('ix_fire_force_items_ref_id', table_name='fire_force_items')
    op.drop_index('ix_fire_force_items_ref_type', table_name='fire_force_items')
    op.drop_table('fire_force_items')
```

- [ ] **Step 4: 跑 migration + 测试**

Run: `cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run alembic upgrade head && uv run pytest tests/test_fire_force_items.py -v`
Expected: migration 成功;3 个 CRUD 测试 + 3 个 Task1 测试全 passed(共 6 passed)

> conftest 测试库 `fire_rescue_test` 用 `Base.metadata.create_all` 建表(不跑 alembic),所以测试不受 migration 影响——migration 只作用于开发库。两步都要成功。

- [ ] **Step 5: Commit(znya 仓库)**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119
git add server/app/api/fire_force_items.py server/main.py server/alembic/versions/ server/tests/test_fire_force_items.py
git commit -m "feat(force): /fire-force-items CRUD 路由 + Alembic migration + 契约测试"
```

---

### Task 3: znya seed 脚本(14 站 + 明细,幂等)+ 回填

**Files:**
- Create: `scripts/seed_demo_data.py`

**Interfaces:**
- Consumes: Task 1 模型(FireStation/FireForceItem)、Task 2 表(dev 库)。
- Produces: dev 库 14 站(fire_stations)+ 每站车辆/人员/装备明细(fire_force_items)。Task 4/5/6 前端验证依赖回填结果。

- [ ] **Step 1: 写 seed 脚本**

`scripts/seed_demo_data.py`:
```python
"""执勤力量演示数据播种：14 个消防站 + 每站车辆/人员/装备明细（幂等，重复执行安全）。

用法：cd server && uv run python scripts/seed_demo_data.py
数据对齐 web 原型 mock(src/mock/stations.ts)的量级与坐标公式。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database.connection import SessionLocal
from app.models.fire_force_item import FireForceItem
from app.models.fire_station import FireStation

# (name, station_type, personnel_count, vehicle_count)
STATIONS = [
    ("城东救援站", "救援站", 42, 6),
    ("城西救援站", "救援站", 38, 5),
    ("云锦路站", "救援站", 36, 5),
    ("珠江路救援站", "救援站", 40, 6),
    ("滨江救援站", "救援站", 35, 4),
    ("高新救援站", "救援站", 33, 4),
    ("鼓楼救援大队", "救援大队", 58, 8),
    ("玄武救援大队", "救援大队", 62, 9),
    ("龙潭政府专职站", "政府专职站", 24, 3),
    ("板桥政府专职站", "政府专职站", 22, 3),
    ("化工园企业专职站", "企业专职站", 18, 2),
    ("港区企业专职站", "企业专职站", 20, 2),
    ("金茂大厦微型站", "微型消防站", 6, 0),
    ("中央商场微型站", "微型消防站", 5, 0),
]
STREETS = ["珠江路", "中山路", "滨江大道", "云锦路", "龙蟠路", "北京东路", "长江路"]
CONTACTS = ["张海涛", "李卫国", "陈志强", "王建军", "刘晓东", "赵永刚", "孙明辉"]

VEHICLE_SUBTYPES = ["水罐车", "举高喷射车", "抢险救援车", "登高平台车", "云梯车"]
VEHICLE_STATUSES = ["在位", "在位", "在位", "出警", "维保"]  # 轮询，偏重"在位"
PERSONNEL = [("干部", 2), ("消防员", 2), ("专职队员", 1)]
EQUIPMENT_SUBTYPES = ["基本防护", "特种防护", "侦检", "破拆", "照明排烟", "泵类"]
EQUIPMENT_NAMES = {
    "基本防护": ["灭火防护服", "消防头盔", "空气呼吸器"],
    "特种防护": ["隔热服", "防化服"],
    "侦检": ["热成像仪", "可燃气体检测仪"],
    "破拆": ["液压破拆工具组", "无齿锯"],
    "照明排烟": ["移动照明灯组", "正压排烟机"],
    "泵类": ["手抬机动泵", "浮艇泵"],
}
EQUIPMENT_STATUSES = ["正常", "正常", "正常", "告警", "离线"]


def _upsert_station(db, name, station_type, personnel, vehicles, idx) -> FireStation:
    st = db.query(FireStation).filter(FireStation.name == name).first()
    if st is None:
        st = FireStation(name=name)
        db.add(st)
    lng = round(118.742 + (((idx * 37 + 13) % 100) / 100) * 0.096, 4)
    lat = round(32.028 + (((idx * 53 + 29) % 100) / 100) * 0.062, 4)
    st.station_type = station_type
    st.brigade = "市消防救援支队"
    st.address = f"{STREETS[idx % len(STREETS)]} {100 + idx * 7} 号"
    st.longitude, st.latitude = lng, lat
    st.district_code = "320102"
    st.duty_phone = f"025-83{11 + idx}****"
    st.status = "normal"
    base, rem = divmod(vehicles, 3)
    st.extra_attrs = {
        "commander": CONTACTS[idx % len(CONTACTS)],
        "personnel_count": personnel,
        # 车辆总数=vehicles:均分到前 3 类,余数补前几类
        "vehicle_summary": {
            sub: base + (1 if i < rem else 0) for i, sub in enumerate(VEHICLE_SUBTYPES[:3])
        },
        "equipment": "水枪、水带、破拆工具组、空气呼吸器",
    }
    return st


def _build_items(st: FireStation):
    """按站生成车辆/人员/装备明细;返回替换前先清旧(幂等)。"""
    items = []
    n = 0
    # 车辆:明细条数 = vehicle_summary 总数(=该站车辆数)
    veh = sum((st.extra_attrs.get("vehicle_summary") or {}).values())
    for v in range(veh):
        n += 1
        sub = VEHICLE_SUBTYPES[n % len(VEHICLE_SUBTYPES)]
        items.append(FireForceItem(
            ref_type="fire_station", ref_id=st.id, force_type="车辆",
            name=f"{sub} A-{n:03d}", subtype=sub,
            status=VEHICLE_STATUSES[n % len(VEHICLE_STATUSES)],
        ))
    # 人员
    for sub, cnt in PERSONNEL:
        for _ in range(cnt):
            n += 1
            items.append(FireForceItem(
                ref_type="fire_station", ref_id=st.id, force_type="人员",
                name=f"{sub} {CONTACTS[n % len(CONTACTS)]}{n}", subtype=sub,
                status="在位" if n % 11 != 0 else "出警",
            ))
    # 装备
    for sub in EQUIPMENT_SUBTYPES:
        n += 1
        names = EQUIPMENT_NAMES[sub]
        items.append(FireForceItem(
            ref_type="fire_station", ref_id=st.id, force_type="装备",
            name=f"{names[n % len(names)]} ZJ-{n:03d}", subtype=sub,
            status=EQUIPMENT_STATUSES[n % len(EQUIPMENT_STATUSES)],
        ))
    return items


def main() -> None:
    db = SessionLocal()
    try:
        stations = []
        for idx, (name, stype, personnel, vehicles) in enumerate(STATIONS):
            st = _upsert_station(db, name, stype, personnel, vehicles, idx)
            db.flush()  # 确保 st.id
            # 幂等：清掉该站旧明细再重建
            db.query(FireForceItem).filter(
                FireForceItem.ref_type == "fire_station", FireForceItem.ref_id == st.id
            ).delete()
            for item in _build_items(st):
                db.add(item)
            stations.append(st.name)
        db.commit()
        total_items = db.query(FireForceItem).filter(FireForceItem.ref_type == "fire_station").count()
        print(f"播种完成: {len(stations)} 站, 明细 {total_items} 条")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

> 注意:上面 `_build_items` 里的占位 `for i in range(...): pass` 是多余的,编写时直接删除该 3 行(`veh = sum(...)` 前的两行),保留 `veh = sum((st.extra_attrs.get("vehicle_summary") or {}).values())`。以实际落盘代码为准:车辆数取 `vehicle_summary` 各车型之和(即任务定义里该站的车辆数,因 seed 把前 3 类各设为 vehicle_count)。

- [ ] **Step 2: 运行 seed**

Run: `cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run python scripts/seed_demo_data.py`
Expected: `播种完成: 14 站, 明细 N 条`(N = Σ(vehicle_count×3 类合计…实际按 vehicle_summary 求和)+ 14×(5 人员 + 6 装备);约 200+ 条)

- [ ] **Step 3: 验证 API 返回(需 znya 已重启,见 Step 4)**

Run(先重启 znya 使新表/migration 生效):
`curl -s http://localhost:8000/fire-force-items/?ref_type=fire_station\&page_size=5 -H "Content-Type: application/json"` → 需带 token;用 web 代理更省事:
`curl -s "http://localhost:3000/api/business/fire-force-items?ref_type=fire_station&page_size=5" | head -c 500`
Expected: 200,`total` ≥ 200,items 含 `force_type/name/subtype/status/ref_id`

- [ ] **Step 4: 重启 znya(使 migration + seed 生效)**

znya 当前进程(旧代码)需要重启:
```bash
# 先找到并结束旧进程,再 setsid 重启(参考记忆:防止 Bash 工具 SIGTERM 杀服务)
pkill -f "uvicorn main:app" || true
sleep 1
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server
setsid .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 > /tmp/znya.log 2>&1 < /dev/null &
sleep 3 && curl -s http://localhost:8000/health
```
Expected: `{"status": "ok"}`(或类似 200)

- [ ] **Step 5: Commit(znya 仓库)**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119
git add server/scripts/seed_demo_data.py
git commit -m "feat(force): 执勤力量演示数据 seed(14 站 + 车辆/人员/装备明细,幂等)"
```

---

### Task 4: web 映射/聚合纯函数 `lib/force-mapper.ts`(TDD)

**Files:**
- Create: `lib/force-mapper.ts`
- Create: `lib/__tests__/force-mapper.test.ts`

**Interfaces:**
- Consumes: `src/mock/types.ts` 的 `Station/ResourceItem/FetchState` 类型(mock 契约)。
- Produces:
  - `mapStation(raw: ZnyaStation): Station`(snake→camel,`extra_attrs` 展开,`vehicles`=vehicle_summary 求和)
  - `mapResource(raw: ZnyaForceItem): ResourceItem`(`force_type→category`、`ref_id→stationId`)
  - `buildForceStats(stations: Station[], resources: ResourceItem[]): { value: number; delta?: string }[]`(顺序:队站/人员/车辆/装备)
  - `buildResourceTree(stations: Station[], resources: ResourceItem[]): { category: string; children: { name: string; count: number }[] }[]`
- znya 原始类型(内联定义,与 znya 返回对齐):
```ts
export interface ZnyaStation {
  id: string; name: string; station_type: string; address?: string | null;
  longitude?: number | null; latitude?: number | null; duty_phone?: string | null;
  status: string;
  extra_attrs?: { commander?: string | null; personnel_count?: number | null; vehicle_summary?: Record<string, number> | null; equipment?: string | null } | null;
}
export interface ZnyaForceItem {
  id: string; ref_type: string; ref_id: string; force_type: string;
  name: string; subtype: string; status: string;
}
```

- [ ] **Step 1: 写失败测试**

`lib/__tests__/force-mapper.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mapStation, mapResource, buildForceStats, buildResourceTree } from '../force-mapper';

const RAW_STATION = {
  id: 'st-1', name: '城东救援站', station_type: '救援站', address: '珠江路 100 号',
  longitude: 118.7545, latitude: 32.046, duty_phone: '025-8311****', status: 'normal',
  extra_attrs: { commander: '张海涛', personnel_count: 42, vehicle_summary: { 水罐车: 2, 云梯车: 1 } },
};
const RAW_VEHICLE = {
  id: 'f-1', ref_type: 'fire_station', ref_id: 'st-1', force_type: '车辆',
  name: '水罐车 A-001', subtype: '水罐车', status: '在位',
};

describe('force-mapper', () => {
  it('mapStation 映射 snake→camel 并展开 extra_attrs', () => {
    const s = mapStation(RAW_STATION);
    expect(s.name).toBe('城东救援站');
    expect(s.type).toBe('救援站');
    expect(s.lng).toBe(118.7545);
    expect(s.lat).toBe(32.046);
    expect(s.dutyPhone).toBe('025-8311****');
    expect(s.contact).toBe('张海涛');
    expect(s.personnel).toBe(42);
    expect(s.vehicles).toBe(3); // 2 + 1
  });

  it('mapStation 容忍缺省 extra_attrs/坐标', () => {
    const s = mapStation({ id: 'st-x', name: 'X站', station_type: '微型消防站', status: 'normal' });
    expect(s.personnel).toBe(0);
    expect(s.vehicles).toBe(0);
    expect(s.contact).toBe('');
  });

  it('mapResource 映射 force_type→category / ref_id→stationId', () => {
    const r = mapResource(RAW_VEHICLE);
    expect(r.category).toBe('车辆');
    expect(r.stationId).toBe('st-1');
    expect(r.subtype).toBe('水罐车');
    expect(r.status).toBe('在位');
  });

  it('buildForceStats 聚合队站/人员/车辆/装备', () => {
    const stations = [mapStation(RAW_STATION), mapStation({ id: 'st-2', name: '城西救援站', station_type: '救援站', status: 'normal' })];
    const resources = [mapResource(RAW_VEHICLE), mapResource({ ...RAW_VEHICLE, id: 'f-2', force_type: '人员', subtype: '干部' }), mapResource({ ...RAW_VEHICLE, id: 'f-3', force_type: '装备', subtype: '侦检' })];
    const stats = buildForceStats(stations, resources);
    expect(stats.map((s) => s.value)).toEqual([2, 1, 1, 1]);
    expect(stats.every((s) => s.delta === undefined)).toBe(true);
  });

  it('buildResourceTree 按分类/子类分组', () => {
    const stations = [mapStation(RAW_STATION), mapStation({ id: 'st-2', name: '鼓楼大队', station_type: '救援大队', status: 'normal' })];
    const resources = [
      mapResource(RAW_VEHICLE),
      mapResource({ ...RAW_VEHICLE, id: 'f-2', force_type: '人员', subtype: '干部' }),
      mapResource({ ...RAW_VEHICLE, id: 'f-3', force_type: '装备', subtype: '侦检' }),
    ];
    const tree = buildResourceTree(stations, resources);
    const stationNode = tree.find((g) => g.category === '队站');
    expect(stationNode?.children).toEqual([{ name: '救援站', count: 1 }, { name: '救援大队', count: 1 }]);
    expect(tree.find((g) => g.category === '人员')?.children).toEqual([{ name: '干部', count: 1 }]);
    expect(tree.find((g) => g.category === '装备')?.children).toEqual([{ name: '侦检', count: 1 }]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/ljb/program/FireRescueAI/web && npx vitest run lib/__tests__/force-mapper.test.ts`
Expected: FAIL(`Cannot find module '../force-mapper'`)

- [ ] **Step 3: 写映射纯函数**

`lib/force-mapper.ts`:
```ts
import type { ResourceItem, Station } from '../src/mock/types';

/** znya /fire-stations 返回(与 znya 字段对齐,read-only 快照)。 */
export interface ZnyaStation {
  id: string;
  name: string;
  station_type: string;
  address?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  duty_phone?: string | null;
  status: string;
  extra_attrs?: {
    commander?: string | null;
    personnel_count?: number | null;
    vehicle_summary?: Record<string, number> | null;
    equipment?: string | null;
  } | null;
}

/** znya /fire-force-items 返回项。 */
export interface ZnyaForceItem {
  id: string;
  ref_type: string;
  ref_id: string;
  force_type: string;
  name: string;
  subtype: string;
  status: string;
}

const sumVehicle = (summary?: Record<string, number> | null): number =>
  Object.values(summary ?? {}).reduce((a, b) => a + b, 0);

export function mapStation(raw: ZnyaStation): Station {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.station_type,
    contact: raw.extra_attrs?.commander ?? '',
    dutyPhone: raw.duty_phone ?? '',
    address: raw.address ?? '',
    lng: raw.longitude ?? 0,
    lat: raw.latitude ?? 0,
    personnel: raw.extra_attrs?.personnel_count ?? 0,
    vehicles: sumVehicle(raw.extra_attrs?.vehicle_summary),
  };
}

export function mapResource(raw: ZnyaForceItem): ResourceItem {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.force_type as ResourceItem['category'],
    subtype: raw.subtype,
    stationId: raw.ref_id,
    status: raw.status as ResourceItem['status'],
  };
}

export interface ForceStat { value: number; delta?: string }

/** 顺序固定:队站 / 人员 / 车辆 / 装备(对齐 ForceResourcePanel 卡片)。 */
export function buildForceStats(stations: Station[], resources: ResourceItem[]): ForceStat[] {
  const countBy = (c: ResourceItem['category']) => resources.filter((r) => r.category === c).length;
  return [
    { value: stations.length },
    { value: countBy('人员') },
    { value: countBy('车辆') },
    { value: countBy('装备') },
  ];
}

export interface ResourceTreeGroup {
  category: string;
  children: Array<{ name: string; count: number }>;
}

/** 队站按 station.type 分组;人员/车辆/装备按 subtype 分组。 */
export function buildResourceTree(
  stations: Station[],
  resources: ResourceItem[],
): ResourceTreeGroup[] {
  const groupBy = <T>(list: T[], key: (t: T) => string) => {
    const map = new Map<string, number>();
    for (const t of list) map.set(key(t), (map.get(key(t)) ?? 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  };
  const stationTypes = ['救援大队', '救援站', '政府专职站', '企业专职站', '微型消防站'];
  return [
    { category: '队站', children: groupBy(stations, (s) => s.type) },
    { category: '人员', children: groupBy(resources.filter((r) => r.category === '人员'), (r) => r.subtype) },
    { category: '车辆', children: groupBy(resources.filter((r) => r.category === '车辆'), (r) => r.subtype) },
    { category: '装备', children: groupBy(resources.filter((r) => r.category === '装备'), (r) => r.subtype) },
  ].map((g) => g.category === '队站'
    ? { ...g, children: [...g.children].sort((a, b) => stationTypes.indexOf(a.name) - stationTypes.indexOf(b.name)) }
    : g);
}
```

> 队站分组排序:`stationTypes` 固定顺序让树与 mock 一致;`children` 若为空则默认按出现顺序,保留空数组(组件已容忍)。`Station.type` 是枚举联合,而真实 `station_type` 可能超出枚举 —— `mapStation` 返回类型用 `Station`,越界字符串在 TS 编译期不报(赋值自 `raw.station_type: string` 会报),故改为返回 `Station` 且把 `type` 断言为 `Station['type']`:在实际落盘代码中 `type: raw.station_type as Station['type']`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/ljb/program/FireRescueAI/web && npx vitest run lib/__tests__/force-mapper.test.ts`
Expected: 5 passed(注意:若 TS 编译报 `type` 越界,按上面注解补 `as Station['type']`)

- [ ] **Step 5: Commit(web 仓库)**

```bash
cd /home/ljb/program/FireRescueAI/web
git add lib/force-mapper.ts lib/__tests__/force-mapper.test.ts
git commit -m "feat(force): force-mapper 纯函数(映射/聚合/资源树,TDD)"
```

---

### Task 5: web 数据访问层 `src/api/force.ts`

**Files:**
- Create: `src/api/force.ts`

**Interfaces:**
- Consumes: Task 4 的 `mapStation/mapResource/buildForceStats/buildResourceTree` 与 `ZnyaStation/ZnyaForceItem`;`src/mock/types.ts` 的 `FetchState`。
- Produces:
  - `fetchStations(state?: FetchState): Promise<Station[]>`(失败抛错;empty 返回 [])
  - `fetchResources(state?: FetchState): Promise<ResourceItem[]>`
  - `fetchForceStats(state?: FetchState): Promise<{ value: number; delta?: string }[]>`
  - `fetchResourceTree(state?: FetchState): Promise<ResourceTreeGroup[]>`(内部取 stations+resources 后 build)
  - 复用 `lib/force-mapper.ts` 的 `ResourceTreeGroup` 类型。
  Task 6 组件依赖这些函数。

- [ ] **Step 1: 写数据访问层**

`src/api/force.ts`:
```ts
// 执勤力量数据访问层:web /api/business/*(BFF 代理 znya) → 映射为原型数据形状。
import type { FetchState, ResourceItem, Station } from '@/mock/types';
import { buildResourceTree, buildForceStats, mapResource, mapStation } from '@/lib/force-mapper';
import type { ResourceTreeGroup, ZnyaForceItem, ZnyaStation } from '@/lib/force-mapper';

const PAGE_SIZE = 100;

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchStations(state?: FetchState): Promise<Station[]> {
  if (state === 'error') throw new Error('执勤力量加载失败');
  if (state === 'empty') return [];
  const data = await getJson<{ items: ZnyaStation[] }>(
    `/api/business/fire-stations?page_size=${PAGE_SIZE}`,
  );
  return (data.items ?? []).map(mapStation);
}

export async function fetchResources(state?: FetchState): Promise<ResourceItem[]> {
  if (state === 'error') throw new Error('执勤力量明细加载失败');
  if (state === 'empty') return [];
  const data = await getJson<{ items: ZnyaForceItem[] }>(
    `/api/business/fire-force-items?ref_type=fire_station&page_size=${PAGE_SIZE}`,
  );
  return (data.items ?? []).map(mapResource);
}

export async function fetchForceStats(state?: FetchState): Promise<{ value: number; delta?: string }[]> {
  const [stations, resources] = await Promise.all([fetchStations(state), fetchResources(state)]);
  return buildForceStats(stations, resources);
}

export async function fetchResourceTree(state?: FetchState): Promise<ResourceTreeGroup[]> {
  const [stations, resources] = await Promise.all([fetchStations(state), fetchResources(state)]);
  return buildResourceTree(stations, resources);
}
```

> 依赖说明:`@/mock/types` → `./src/mock/types`(tsconfig 双别名 `@/*: ['./src/*','./*']` 首匹配);`@/lib/force-mapper` → 首匹配 `./src/lib/force-mapper` 不存在,回退 `./lib/force-mapper`(根)✓。`lib/force-mapper.ts` 内部用相对路径 `../src/mock/types`(vitest 别名 `@`→根,单映射,不能解析 `@/mock/`),Task 4 已遵守。

- [ ] **Step 2: 验证(需 znya + dev 在跑)**

先确认 znya(8000)与 dev(3000)在跑:
Run: `curl -s http://localhost:8000/health && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/business/fire-stations`
Expected: health 200 + `200`

再验证数据访问层(临时通过 dev 页面或 curl 数据链路):
Run: `curl -s "http://localhost:3000/api/business/fire-stations?page_size=100" | python3 -c "import sys,json; d=json.load(sys.stdin); print('stations', d['total'])"` 与
`curl -s "http://localhost:3000/api/business/fire-force-items?ref_type=fire_station&page_size=100" | python3 -c "import sys,json; d=json.load(sys.stdin); print('items', d['total'])"`
Expected: `stations 14` + `items ≥ 200`

> 若 `fire-force-items` 返回 404:确认 znya 已重启(migration 生效)且代理尾斜杠重试生效(`/fire-force-items` 无尾斜杠 → 代理补 `/`)。

- [ ] **Step 3: Commit(web 仓库)**

```bash
cd /home/ljb/program/FireRescueAI/web
git add src/api/force.ts
git commit -m "feat(force): 数据访问层 src/api/force.ts(经 /api/business 代理 znya)"
```

---

### Task 6: ForceResourcePanel 适配真实数据

**Files:**
- Modify: `src/components/panels/ForceResourcePanel.tsx`
- Modify: `src/App.tsx`(若组件 props 签名变化;预计不变)

**Interfaces:**
- Consumes: Task 5 的 `fetchStations/fetchResources/fetchForceStats/fetchResourceTree`。
- Produces: 组件从 mock 切到真实数据;行为不变(搜索/树过滤/详情弹窗/场景定位/状态演示)。

- [ ] **Step 1: 切换 import 与数据源**

`ForceResourcePanel.tsx` 修改:
```tsx
// 原:
import { fetchForceStats, fetchResources, fetchStations, RESOURCE_TREE } from '@/mock/stations';
// 新:
import { fetchStations, fetchResources, fetchForceStats, fetchResourceTree } from '@/api/force';
```
- 新增 state:`const [tree, setTree] = useState<ResourceTreeGroup[]>([]);`(import 类型 `import type { ResourceTreeGroup } from '@/lib/force-mapper';`)
- `load` 改为(注意 `fetchForceStats` 返回 `{value, delta?}[]`,顺序 队站/人员/车辆/装备,直接 set):
```tsx
const load = useCallback(async (s: FetchState) => {
  if (s === 'loading') { setState('loading'); return; }
  setState('loading');
  try {
    const [st, rs, statList, tr] = await Promise.all([
      fetchStations({ state: s }),
      fetchResources({ state: s }),
      fetchForceStats({ state: s }),
      fetchResourceTree({ state: s }),
    ]);
    setStations(st);
    setResources(rs);
    setStats(statList); // {value, delta?}[] 顺序 队站/人员/车辆/装备
    setTree(tr);
    setState(st.length === 0 && rs.length === 0 ? 'empty' : 'ok');
  } catch {
    setState('error');
  }
}, []);
```
- 组件 state 类型微调(原 `delta: string` → `delta?: string`,容忍 mapper 不返回 delta):
```tsx
const [stats, setStats] = useState<{ value: number; delta?: string }[]>([]);
```
- 渲染处 `RESOURCE_TREE.map(...)` → `tree.map(...)`。

- [ ] **Step 2: 详情弹窗与场景定位字段确认**

`ForceResourcePanel.tsx` 中 `Station` 字段已由 mapper 映射为 camelCase(`contact`/`dutyPhone`/`lng`/`lat`/`address`),详情弹窗 `dialog.contact/dialog.dutyPhone/dialog.address/dialog.lng/dialog.lat` **无需改字段名**。仅确认:
- `writeLinkage` 用 `s.lng,s.lat`(真实经纬度)✓ 无需改
- 底部"已加载全部 N 条 · 演示数据"文案保留(用户决策:保留演示标注)

- [ ] **Step 3: 验证(dev 页面走查)**

Run: dev(3000)已在跑,浏览器打开态势总览:
- 统计卡片:队站 14 / 人员(明细人员数)/ 车辆 / 装备
- 队站列表:14 个真实站名 + 坐标
- 树:队站按 5 类分组 count;点击站行 → 详情弹窗(commander/电话/地址/经纬度)→ "场景定位"写入 sceneLog
- 状态演示下拉(ok/loading/empty/error)仍可用

用 curl 冒烟(若浏览器不便):确认 `GET http://localhost:3000/api/business/fire-stations?page_size=100` 返回 14 站。

- [ ] **Step 4: Commit(web 仓库)**

```bash
cd /home/ljb/program/FireRescueAI/web
git add src/components/panels/ForceResourcePanel.tsx
git commit -m "feat(force): ForceResourcePanel 接真实执勤力量数据(znya)"
```

---

### Task 7: 全量验证

**Files:**
- 无代码改动(验证 + 必要时小修)。

- [ ] **Step 1: web 三绿**

Run:
```bash
cd /home/ljb/program/FireRescueAI/web && npm run typecheck && npm run build && npx vitest run
```
Expected: typecheck 0 错误;build 成功(路由清单含 `/api/business`);vitest 全绿(原 95 + force-mapper 5 = 100)。

- [ ] **Step 2: znya 全量 pytest**

Run: `cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run pytest -q`
Expected: 原 96 + 6(fire_force_items)= 102 passed(不引入失败)

- [ ] **Step 3: 走查大屏**

浏览器打开 `http://localhost:3000`:态势总览(ForceResourcePanel)显示真实 14 站 + 车辆/人员/装备;统计卡片正确;树分组与详情弹窗正常;状态演示可用。3D 场景定位(flyTo 真实坐标)正常。

- [ ] **Step 4: 记录记忆 + 收尾**

- 更新记忆:`incremental-step3-force-resources-done.md`(新增,znya 端 fire_force_items 模块 + web 数据层 + ForceResourcePanel 真实化;命令:znya 重启 + seed 运行方式)+ `MEMORY.md` 索引。
- 未 push commit:znya 3 个 + web 3 个,询问用户 push 时机。

- [ ] **Step 5: 完成汇报**

按报告格式汇报:改动文件、验证结果(三绿 + 102 passed + 走查)、下一步候选(架构第 3 步建筑档案 id 对齐 / 其它业务模块接入)。
