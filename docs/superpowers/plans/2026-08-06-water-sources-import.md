# 水源数据注入(第 1 批,614 条)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `资源/` 下两个水源 Excel(586 + 28 = 614 条)经清洗、映射、坐标系处理后,以幂等方式注入 znya 的 `water_sources` 表,并验证 web BFF 可查。

**Architecture:** 纯逻辑(坐标转换 / 行映射 / 类型规范化 / upsert)抽到 `app/services/water_import.py` 并 TDD;CLI 入口 `scripts/import_water_sources.py` 负责 Excel IO 与事务编排;先 dry-run → 1 条试跑 → 全量,坐标抽样核验,出错用 `--undo` 精确回滚本批。

**Tech Stack:** Python 3.12 · SQLAlchemy 2.x(ORM + `postgresql.insert.on_conflict_do_nothing`)· openpyxl(读 xlsx,已装入 znya .venv)· pytest(znya `tests/`)· PostgreSQL `fire_rescue`。

## Global Constraints

(摘自 spec `2026-08-06-water-sources-import-design.md`,所有 task 隐含遵守)

- znya 仓库在分支 `feature/fire-station-entity`;所有改动落在 `/home/ljb/program/FireRescueAI/znya_jjxf119/server`
- 跑测试:`cd server && uv run pytest tests/<file>.py -v`
- 跑脚本:`cd server && uv run python scripts/import_water_sources.py [...flags]`
- DB 连接:`from app.database.connection import SessionLocal`(`db = SessionLocal()`)
- ORM 模型:`from app.models.water_source import WaterSource`(字段见表;`id/created_at/updated_at/deleted_at` 由 `TimestampedModel` 提供,`id` default `uuid4`)
- `water_type` 合法值集:{市政消火栓, 天然水源, 消防水池, 水泵接合器, 室外消火栓, 室内消火栓}
- `status` 用英文 `"normal"`(不用中文"正常")
- 区名→区划码:濂溪区=360404 / 柴桑区=360411 / 浔阳区=360410 / 彭泽县=360406
- 坐标合法范围:lng ∈ [113, 119]、lat ∈ [28, 31](越界跳过)
- 批次标记:`import_batch = "2026-08-06-water"`(写入 `extra_attrs`,供 `--undo` 精确回滚)
- 幂等:`ON CONFLICT (ref_type, ref_id, name, location_path) DO NOTHING`
- 参考脚本:`scripts/seed_jiujiang_stations.py`(82 站导入,含 `gcj02_to_wgs84` 实现可复用)

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `app/services/water_import.py` | 纯逻辑:`gcj02_to_wgs84`、`REGION_TO_CODE`、`WATER_TYPE_MAP`、`parse_lnglat`、`normalize_water_type`、`map_detail_row`、`map_export_row`、`upsert_water_sources`、`delete_batch` | 新建 |
| `tests/test_water_import.py` | 上述纯函数 + upsert 幂等的单测 | 新建 |
| `scripts/import_water_sources.py` | CLI:读 Excel → 调映射 → dry-run/limit/undo/coord → 事务 upsert | 新建 |

> 不改 `water_source.py` 模型、不改 web 代码、不做 Alembic 迁移(本批复用现有表与字段)。

---

### Task 1: 水源导入纯逻辑模块(app/services/water_import.py,TDD)

**Files:**
- Create: `app/services/water_import.py`
- Test: `tests/test_water_import.py`

**Interfaces:**
- Produces(后续 task / 脚本依赖的签名):
  - `IMPORT_BATCH: str = "2026-08-06-water"`
  - `REGION_TO_CODE: dict[str, str]`
  - `WATER_TYPE_MAP: dict[str, str]`
  - `def parse_lnglat(lng, lat) -> tuple[float, float] | None`
  - `def gcj02_to_wgs84(lng: float, lat: float) -> tuple[float, float]`
  - `def normalize_water_type(raw, default="市政消火栓") -> str`
  - `def map_detail_row(row: dict) -> dict | None`
  - `def map_export_row(row: dict) -> dict | None`
  - `def upsert_water_sources(db, rows: list[dict], coord: str = "wgs84") -> dict` → `{"inserted": int, "conflicts": int}`
  - `def delete_batch(db, batch: str = IMPORT_BATCH) -> int`

- [ ] **Step 1: 写失败测试 `tests/test_water_import.py`**

```python
"""水源导入纯逻辑:映射/规范化/坐标/upsert 幂等。"""
import pytest
from app.services.water_import import (
    IMPORT_BATCH, REGION_TO_CODE, WATER_TYPE_MAP,
    parse_lnglat, gcj02_to_wgs84, normalize_water_type,
    map_detail_row, map_export_row,
    upsert_water_sources, delete_batch,
)


def test_region_to_code():
    assert REGION_TO_CODE["濂溪区"] == "360404"
    assert REGION_TO_CODE["柴桑区"] == "360411"
    assert REGION_TO_CODE["浔阳区"] == "360410"
    assert REGION_TO_CODE["彭泽县"] == "360406"
    assert REGION_TO_CODE.get("未知区") is None


def test_normalize_water_type():
    assert normalize_water_type("市政地上消火栓") == "市政消火栓"
    assert normalize_water_type("天然水体") == "天然水源"
    assert normalize_water_type("消防水池") == "消防水池"
    assert normalize_water_type("市政消火栓") == "市政消火栓"  # 已合法直通
    assert normalize_water_type(None) == "市政消火栓"          # 空用默认
    assert normalize_water_type("") == "市政消火栓"
    assert normalize_water_type("乱七八糟") == "市政消火栓"     # 未知用默认


def test_parse_lnglat_ok_and_bad():
    assert parse_lnglat(115.92, 29.70) == (115.92, 29.70)
    assert parse_lnglat("115.92", "29.70") == (115.92, 29.70)
    assert parse_lnglat("-", "-") is None          # 非法文本
    assert parse_lnglat(None, None) is None
    assert parse_lnglat(10.0, 29.7) is None        # 经度越界
    assert parse_lnglat(115.9, 5.0) is None        # 纬度越界


def test_gcj02_to_wgs84_reasonable():
    out_lng, out_lat = gcj02_to_wgs84(115.95, 29.70)
    assert isinstance(out_lng, float) and isinstance(out_lat, float)
    # GCJ02→WGS84 应有数百米级偏移(度 < 0.02),且非零
    assert 1e-5 < abs(out_lng - 115.95) < 0.02
    assert 1e-5 < abs(out_lat - 29.70) < 0.02


def test_map_detail_row_ok():
    row = {"序号": 2, "区域": "柴桑区", "地址": "江西省九江市柴桑区沙阎路",
           "名称": "JJ-BLHSYL-002", "经度": 115.923, "纬度": 29.698}
    m = map_detail_row(row)
    assert m is not None
    assert m["ref_type"] == "district" and m["ref_id"] == "360411"
    assert m["water_type"] == "市政消火栓"           # 明细无类别→默认
    assert m["status"] == "normal"
    assert m["name"] == "JJ-BLHSYL-002"
    assert m["location_path"] == "江西省九江市柴桑区沙阎路"
    assert m["longitude"] == 115.923 and m["latitude"] == 29.698
    assert m["district_code"] == "360411"
    assert m["extra_attrs"]["import_batch"] == IMPORT_BATCH
    assert m["extra_attrs"]["source_file"] == "水源明细.xlsx"
    assert m["extra_attrs"]["raw_region"] == "柴桑区"


def test_map_detail_row_skips():
    assert map_detail_row({"区域": "火星", "名称": "x", "经度": 115.9, "纬度": 29.7}) is None
    assert map_detail_row({"区域": "柴桑区", "名称": "", "经度": 115.9, "纬度": 29.7}) is None
    assert map_detail_row({"区域": "柴桑区", "名称": "x", "经度": "-", "纬度": "-"}) is None


def test_map_export_row_ok():
    row = {"水源编号*": "009", "名称*": "市政消火栓02", "水源类别*": "市政地上消火栓",
           "地址*": "矶山工业园门前路", "经度*": 116.5822, "纬度*": 29.9502,
           "省": "江西省", "市": "九江市", "区": "彭泽县", "维护单位": "彭泽县消防救援大队"}
    m = map_export_row(row)
    assert m is not None
    assert m["ref_type"] == "district" and m["ref_id"] == "360406"
    assert m["water_type"] == "市政消火栓"          # 规范化:市政地上消火栓→市政消火栓
    assert m["district_code"] == "360406"
    assert m["extra_attrs"]["maintainer"] == "彭泽县消防救援大队"
    assert m["extra_attrs"]["source_no"] == "009"


def test_map_export_row_normalizes_natural_water():
    row = {"水源编号*": "s1", "名称*": "长江取水口", "水源类别*": "天然水体",
           "地址*": "某处", "经度*": 116.58, "纬度*": 29.95, "区": "彭泽县"}
    m = map_export_row(row)
    assert m["water_type"] == "天然水源"            # 天然水体→天然水源


def test_upsert_idempotent(db_session):
    """upsert 同一批数据两次:第二次不翻倍(conflict)。"""
    one = map_detail_row({"区域": "柴桑区", "地址": "测试路A",
                          "名称": "TEST-WS-001", "经度": 115.9, "纬度": 29.7})
    r1 = upsert_water_sources(db_session, [one])
    assert r1["inserted"] == 1 and r1["conflicts"] == 0
    r2 = upsert_water_sources(db_session, [one])
    assert r2["inserted"] == 0 and r2["conflicts"] == 1   # 唯一约束命中


def test_upsert_coord_gcj02_transforms(db_session):
    """coord='gcj02' 时入库坐标经 gcj02_to_wgs84 转换。"""
    from app.models.water_source import WaterSource
    one = map_detail_row({"区域": "柴桑区", "地址": "测试路B",
                          "名称": "TEST-WS-002", "经度": 115.90, "纬度": 29.70})
    upsert_water_sources(db_session, [one], coord="gcj02")
    got = db_session.query(WaterSource).filter_by(name="TEST-WS-002").one()
    w_lng, w_lat = gcj02_to_wgs84(115.90, 29.70)
    assert abs(got.longitude - w_lng) < 1e-9
    assert abs(got.latitude - w_lat) < 1e-9


def test_delete_batch_removes_only_batch(db_session):
    from app.models.water_source import WaterSource
    one = map_detail_row({"区域": "柴桑区", "地址": "测试路C",
                          "名称": "TEST-WS-003", "经度": 115.9, "纬度": 29.7})
    upsert_water_sources(db_session, [one])
    assert db_session.query(WaterSource).filter_by(name="TEST-WS-003").count() == 1
    n = delete_batch(db_session)
    assert n == 1
    assert db_session.query(WaterSource).filter_by(name="TEST-WS-003").count() == 0
```

- [ ] **Step 2: 跑测试,确认全部失败(模块不存在)**

Run:
```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run pytest tests/test_water_import.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.services.water_import'`(所有用例 ERROR/FAIL)。

- [ ] **Step 3: 实现 `app/services/water_import.py`**

```python
"""水源数据导入:Excel 行 → WaterSource 字典的纯逻辑 + 幂等 upsert。

数据源:资源/水源明细.xlsx(586,无类别)、消防水源导出数据.xlsx(28,彭泽县)。
坐标系:默认按 WGS84 入库;若数据为 GCJ02,upsert 传 coord='gcj02' 用
gcj02_to_wgs84 转换(与 scripts/seed_jiujiang_stations.py 同实现)。
幂等:ON CONFLICT (ref_type, ref_id, name, location_path) DO NOTHING。
"""
import math
from typing import Optional

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.water_source import WaterSource

IMPORT_BATCH = "2026-08-06-water"

REGION_TO_CODE: dict[str, str] = {
    "濂溪区": "360404",
    "柴桑区": "360411",
    "浔阳区": "360410",
    "彭泽县": "360406",
}

# 源类别 → model 合法 water_type(见 water_source.py 注释)
VALID_WATER_TYPES = {
    "市政消火栓", "天然水源", "消防水池", "水泵接合器", "室外消火栓", "室内消火栓",
}
WATER_TYPE_MAP: dict[str, str] = {
    "市政地上消火栓": "市政消火栓",
    "市政地下消火栓": "市政消火栓",
    "天然水体": "天然水源",
    "天然水源": "天然水源",
    "消防水池": "消防水池",
    "室外消火栓": "室外消火栓",
    "室内消火栓": "室内消火栓",
    "水泵接合器": "水泵接合器",
    "市政消火栓": "市政消火栓",
}
DEFAULT_WATER_TYPE = "市政消火栓"

# ---- 坐标转换(GCJ02→WGS84,与 seed_jiujiang_stations.py 同实现)--------------
_PI = math.pi
_A = 6378245.0
_EE = 0.00669342162296594323


def _transform_lat(x: float, y: float) -> float:
    r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * abs(x) ** 0.5
    r += (20 * math.sin(6 * x * _PI) + 20 * math.sin(2 * x * _PI)) * 2 / 3
    r += (20 * math.sin(y * _PI) + 40 * math.sin(y / 3 * _PI)) * 2 / 3
    r += (160 * math.sin(y / 12 * _PI) + 320 * math.sin(y * _PI / 30)) * 2 / 3
    return r


def _transform_lng(x: float, y: float) -> float:
    r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * abs(x) ** 0.5
    r += (20 * math.sin(6 * x * _PI) + 20 * math.sin(2 * x * _PI)) * 2 / 3
    r += (20 * math.sin(x * _PI) + 40 * math.sin(x / 3 * _PI)) * 2 / 3
    r += (150 * math.sin(x / 12 * _PI) + 300 * math.sin(x / 30 * _PI)) * 2 / 3
    return r


def _wgs84_to_gcj02(lng: float, lat: float) -> tuple[float, float]:
    x, y = lng - 105, lat - 35
    d_lat = _transform_lat(x, y)
    d_lng = _transform_lng(x, y)
    rad_lat = lat / 180 * _PI
    magic = 1 - _EE * math.sin(rad_lat) ** 2
    sqrt_magic = math.sqrt(magic)
    d_lat = d_lat * 180 / ((_A * (1 - _EE)) / (magic * sqrt_magic) * _PI)
    d_lng = d_lng * 180 / (_A / sqrt_magic * math.cos(rad_lat) * _PI)
    return lng + d_lng, lat + d_lat


def gcj02_to_wgs84(lng: float, lat: float) -> tuple[float, float]:
    """GCJ02 → WGS84 近似反解(单向误差 < 1e-5 度)。"""
    g_lng, g_lat = _wgs84_to_gcj02(lng, lat)
    return 2 * lng - g_lng, 2 * lat - g_lat


# ---- 字段解析与规范化 -------------------------------------------------------
def parse_lnglat(lng, lat) -> Optional[tuple[float, float]]:
    try:
        f_lng = float(lng)
        f_lat = float(lat)
    except (TypeError, ValueError):
        return None
    if not (113.0 <= f_lng <= 119.0 and 28.0 <= f_lat <= 31.0):
        return None
    return (f_lng, f_lat)


def normalize_water_type(raw, default: str = DEFAULT_WATER_TYPE) -> str:
    s = (str(raw) if raw is not None else "").strip()
    if s in WATER_TYPE_MAP:
        return WATER_TYPE_MAP[s]
    if s in VALID_WATER_TYPES:
        return s
    return default


# ---- 行映射(Excel dict → WaterSource 字段 dict)----------------------------
def map_detail_row(row: dict) -> Optional[dict]:
    """水源明细.xlsx 行 → WaterSource dict;不可用返回 None。"""
    region = (row.get("区域") or "").strip()
    code = REGION_TO_CODE.get(region)
    if not code:
        return None
    name = (row.get("名称") or "").strip()
    if not name:
        return None
    lnglat = parse_lnglat(row.get("经度"), row.get("纬度"))
    if not lnglat:
        return None
    addr = (row.get("地址") or "").strip()
    return {
        "ref_type": "district",
        "ref_id": code,
        "water_type": DEFAULT_WATER_TYPE,  # 明细无类别列
        "name": name,
        "status": "normal",
        "location_path": addr or None,
        "longitude": lnglat[0],
        "latitude": lnglat[1],
        "district_code": code,
        "extra_attrs": {
            "source_file": "水源明细.xlsx",
            "raw_index": row.get("序号"),
            "raw_region": region,
            "import_batch": IMPORT_BATCH,
        },
    }


def map_export_row(row: dict) -> Optional[dict]:
    """消防水源导出数据.xlsx 行 → WaterSource dict;不可用返回 None。"""
    name = (row.get("名称*") or "").strip()
    if not name:
        return None
    lnglat = parse_lnglat(row.get("经度*"), row.get("纬度*"))
    if not lnglat:
        return None
    addr = (row.get("地址*") or "").strip()
    return {
        "ref_type": "district",
        "ref_id": "360406",  # 彭泽县
        "water_type": normalize_water_type(row.get("水源类别*")),
        "name": name,
        "status": "normal",
        "location_path": addr or None,
        "longitude": lnglat[0],
        "latitude": lnglat[1],
        "district_code": "360406",
        "extra_attrs": {
            "source_file": "消防水源导出数据.xlsx",
            "source_no": (row.get("水源编号*") or "").strip(),
            "maintainer": (row.get("维护单位") or "").strip(),
            "province": (row.get("省") or "").strip(),
            "city": (row.get("市") or "").strip(),
            "import_batch": IMPORT_BATCH,
        },
    }


# ---- 写库 / 回滚 ------------------------------------------------------------
_CONFLICT_COLS = ["ref_type", "ref_id", "name", "location_path"]


def upsert_water_sources(db: Session, rows: list[dict], coord: str = "wgs84") -> dict:
    """幂等 upsert;coord='gcj02' 时入库前转换。返回 {inserted, conflicts}。"""
    inserted = 0
    conflicts = 0
    for r in rows:
        lng, lat = r["longitude"], r["latitude"]
        if coord == "gcj02":
            lng, lat = gcj02_to_wgs84(lng, lat)
        values = {**r, "longitude": lng, "latitude": lat}
        stmt = (
            pg_insert(WaterSource)
            .values(**values)
            .on_conflict_do_nothing(index_elements=_CONFLICT_COLS)
            .returning(WaterSource.id)
        )
        result = db.execute(stmt)
        if result.fetchone() is not None:
            inserted += 1
        else:
            conflicts += 1
    db.commit()
    return {"inserted": inserted, "conflicts": conflicts}


def delete_batch(db: Session, batch: str = IMPORT_BATCH) -> int:
    """硬删除指定 import_batch 的本批数据(回滚用)。"""
    stmt = delete(WaterSource).where(
        WaterSource.extra_attrs["import_batch"].astext == batch
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount or 0
```

- [ ] **Step 4: 跑测试,确认全绿**

Run:
```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run pytest tests/test_water_import.py -v
```
Expected: 11 passed。

- [ ] **Step 5: 顺带跑全量测试,确认无回归**

Run:
```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run pytest -q
```
Expected: 既有全绿 + 新增 11 passed(总约 302 passed;PDF libpango 的既有 3 failed 可接受,非本批引入)。

- [ ] **Step 6: 提交**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server
git add app/services/water_import.py tests/test_water_import.py
git commit -m "feat(water): 水源导入纯逻辑(映射/规范化/upsert,TDD)"
```
(提交时在 message 末尾追加 `Co-Authored-By: Claude <noreply@anthropic.com>`)

---

### Task 2: CLI 入口 scripts/import_water_sources.py

**Files:**
- Create: `scripts/import_water_sources.py`

**Interfaces:**
- Consumes(Task 1):`map_detail_row`、`map_export_row`、`upsert_water_sources`、`delete_batch`、`IMPORT_BATCH`
- Produces:可执行脚本 `python scripts/import_water_sources.py [--dry-run|--limit N|--coord wgs84|gcj02|--undo]`

- [ ] **Step 1: 实现 `scripts/import_water_sources.py`**

```python
"""水源 Excel → water_sources 注入(第 1 批,614 条)。

数据源(默认):<repo_root>/资源/{水源明细.xlsx, 消防水源导出数据.xlsx}
  repo_root = 此文件 parents[3](server/scripts/x.py → FireRescueAI)。
可用 --data-dir 覆盖。

用法:
  uv run python scripts/import_water_sources.py --dry-run            # 解析+预览,不写库
  uv run python scripts/import_water_sources.py --limit 1            # 每文件前 1 行试跑
  uv run python scripts/import_water_sources.py                      # 全量(WGS84)
  uv run python scripts/import_water_sources.py --coord gcj02        # 源为 GCJ02,转换后注入
  uv run python scripts/import_water_sources.py --undo               # 撤销本批(import_batch)
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import openpyxl  # noqa: E402

from app.database.connection import SessionLocal  # noqa: E402
from app.services.water_import import (  # noqa: E402
    IMPORT_BATCH,
    map_detail_row,
    map_export_row,
    upsert_water_sources,
    delete_batch,
)

_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "资源"
DETAIL_FILE = "水源明细.xlsx"
EXPORT_FILE = "消防水源导出数据.xlsx"


def read_rows(path: Path) -> list[dict]:
    """读 Excel 首个 sheet → dict 列表(键为表头;表头带 '*' 原样保留)。"""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    it = ws.iter_rows(values_only=True)
    header = next(it, None)
    if header is None:
        wb.close()
        return []
    header = [("" if h is None else str(h).strip()) for h in header]
    rows = []
    for r in it:
        rows.append({header[i]: (r[i] if i < len(r) else None) for i in range(len(header))})
    wb.close()
    return rows


def build_mapped(data_dir: Path, limit: int | None) -> tuple[list[dict], dict]:
    detail_rows = read_rows(data_dir / DETAIL_FILE)
    export_rows = read_rows(data_dir / EXPORT_FILE)
    if limit:
        detail_rows = detail_rows[:limit]
        export_rows = export_rows[:limit]

    mapped: list[dict] = []
    skipped = {"detail": 0, "export": 0}
    for r in detail_rows:
        m = map_detail_row(r)
        if m:
            mapped.append(m)
        else:
            skipped["detail"] += 1
    for r in export_rows:
        m = map_export_row(r)
        if m:
            mapped.append(m)
        else:
            skipped["export"] += 1
    return mapped, {"detail": len(detail_rows), "export": len(export_rows), "skipped": skipped}


def main() -> None:
    ap = argparse.ArgumentParser(description="水源 Excel → water_sources 注入")
    ap.add_argument("--dry-run", action="store_true", help="只解析+预览,不写库")
    ap.add_argument("--limit", type=int, default=None, help="每文件只取前 N 行(试跑)")
    ap.add_argument("--coord", choices=["wgs84", "gcj02"], default="wgs84", help="源坐标系")
    ap.add_argument("--undo", action="store_true", help="按 import_batch 删除本批")
    ap.add_argument("--data-dir", type=Path, default=_DEFAULT_DATA_DIR, help="Excel 所在目录")
    args = ap.parse_args()

    if args.undo:
        db = SessionLocal()
        try:
            n = delete_batch(db)
            print(f"撤销完成: 删除 {n} 条 (import_batch={IMPORT_BATCH})")
        finally:
            db.close()
        return

    mapped, stats = build_mapped(args.data_dir, args.limit)
    print(
        f"读取: 明细={stats['detail']} 导出={stats['export']} | "
        f"映射有效={len(mapped)} | 清洗跳过={stats['skipped']}"
    )
    print(f"数据目录: {args.data_dir}")
    for m in mapped[:5]:
        print(
            f"  预览: name={m['name']!r} type={m['water_type']} "
            f"({m['longitude']:.5f},{m['latitude']:.5f}) district={m['district_code']}"
        )

    if args.dry_run:
        print("[dry-run] 未写库")
        return

    db = SessionLocal()
    try:
        result = upsert_water_sources(db, mapped, coord=args.coord)
        print(
            f"写入完成: inserted={result['inserted']} conflicts={result['conflicts']} "
            f"(coord={args.coord}, batch={IMPORT_BATCH})"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: dry-run 跑通,确认解析无误**

Run:
```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run python scripts/import_water_sources.py --dry-run
```
Expected: 输出 `读取: 明细=586 导出=28 | 映射有效≈614 | 清洗跳过={'detail': 0, 'export': 0}`(允许明细极少跳过),预览 5 条 name/type/坐标/district 正确,**最后一行 `[dry-run] 未写库`**。

- [ ] **Step 3: 提交**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server
git add scripts/import_water_sources.py
git commit -m "feat(water): 水源注入 CLI(dry-run/limit/coord/undo)"
```
(末尾追加 `Co-Authored-By: Claude <noreply@anthropic.com>`)

---

### Task 3: 试跑 → 全量注入 → 核验

**Files:** 无新文件(运行脚本 + 验证)

- [ ] **Step 1: 1 条试跑(每文件前 1 行),确认字段正确入库**

Run:
```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run python scripts/import_water_sources.py --limit 1
```
Expected: `inserted=2 conflicts=0`(明细 1 + 导出 1)。

查库确认:
```bash
docker exec fire-rescue-postgres psql -U fire_rescue -d fire_rescue -c \
"SELECT name, water_type, status, longitude, latitude, district_code, extra_attrs->>'import_batch' AS batch, extra_attrs->>'source_file' AS src FROM water_sources WHERE extra_attrs->>'import_batch'='2026-08-06-water';"
```
Expected: 2 行,字段映射与 spec 一致(status=normal, district_code 正确, batch=2026-08-06-water)。

- [ ] **Step 2: 撤销试跑数据,准备全量**

Run:
```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run python scripts/import_water_sources.py --undo
```
Expected: `撤销完成: 删除 2 条`。

确认归零:
```bash
docker exec fire-rescue-postgres psql -U fire_rescue -d fire_rescue -t -c \
"SELECT count(*) FROM water_sources WHERE extra_attrs->>'import_batch'='2026-08-06-water';"
```
Expected: `0`。

- [ ] **Step 3: 全量注入(默认 WGS84)**

Run:
```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run python scripts/import_water_sources.py
```
Expected: `inserted≈614 conflicts≈0`(明细 586 + 导出 28,允许极少冲突)。

- [ ] **Step 4: DB 计数 + 分布核验**

Run:
```bash
docker exec fire-rescue-postgres psql -U fire_rescue -d fire_rescue -c \
"SELECT count(*) AS total, count(*) FILTER (WHERE extra_attrs->>'import_batch'='2026-08-06-water') AS this_batch FROM water_sources WHERE deleted_at IS NULL;"
docker exec fire-rescue-postgres psql -U fire_rescue -d fire_rescue -c \
"SELECT district_code, water_type, count(*) FROM water_sources WHERE extra_attrs->>'import_batch'='2026-08-06-water' GROUP BY district_code, water_type ORDER BY 1,2;"
```
Expected: `this_batch ≈ 614`;分布:360404(濂溪)/360411(柴桑)/360410(浔阳)water_type=市政消火栓;360406(彭泽)含 市政消火栓/消防水池/天然水源。

- [ ] **Step 5: 坐标系抽样核验(决定是否需要 GCJ02 转换)**

取 3 个样本坐标(明细跨区 + 导出彭泽):
```bash
docker exec fire-rescue-postgres psql -U fire_rescue -d fire_rescue -c \
"SELECT name, longitude, latitude, district_code FROM water_sources WHERE extra_attrs->>'import_batch'='2026-08-06-water' AND name IN ('JJ-BLHSYL-001', (SELECT name FROM water_sources WHERE district_code='360404' AND extra_attrs->>'import_batch'='2026-08-06-water' LIMIT 1 OFFSET 5)) LIMIT 3;"
```
将样本经纬度分别输入:
- 天地图在线(WGS84/CGCS2000)
- 高德地图在线(GCJ02)

**判据**:消火栓应落在**路网旁**。
- 天地图落点正确 → 当前 WGS84 入库正确,**无需处理**,Task 3 完成。
- 高德落点正确 → 源为 GCJ02,执行 Step 6 转换重注。

- [ ] **Step 6(条件):若为 GCJ02,转换后重注**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server
uv run python scripts/import_water_sources.py --undo          # 删 WGS84 误判批次
uv run python scripts/import_water_sources.py --coord gcj02   # GCJ02→WGS84 转换后重注
```
核验分布不变(Step 4 重跑),坐标已偏移修正。

- [ ] **Step 7: web BFF 可查验证(若 web dev server 或 znya uvicorn 在跑)**

znya 直连(最可靠):
```bash
curl -s "http://127.0.0.1:8000/water-sources/?page=1&page_size=2" -H "Authorization: Bearer <token>" | head -c 500
```
或 web BFF:
```bash
curl -s "http://127.0.0.1:3000/api/business/water-sources/?page=1&page_size=2" | head -c 500
```
Expected: `total` ≈ 615(含旧 1 条测试水),`items` 含本批水源。

> 若 znya/web 未在跑,跳过本步(DB 计数 Step 4 已证明数据落库);BFF 可见性是后续 web 前端水源图层的 follow-up 前提,不在本批。

- [ ] **Step 8: 全量测试 + 提交日志(可选,记录注入结果)**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run pytest -q
```
Expected: 全绿(本批只加数据 + 脚本,不动既有逻辑)。

> 注入的数据不入 git(在 DB 里);本步仅确认测试无回归。Task 1/2 的脚本代码已在各自 task 提交。

---

## Self-Review(写计划后自查)

**1. Spec coverage** — 对照 spec 各节:
- 数据源清单(586+28)→ Task 2 Step 2 dry-run 校验行数 ✓
- 字段映射(含 status 英文、water_type 默认/规范化、ref_type=district、区划码)→ Task 1 map_* + 测试 ✓
- 区名→区划码 → `REGION_TO_CODE` + test ✓
- extra_attrs(明细/导出 + import_batch)→ map_* + test ✓
- 去重幂等(ON CONFLICT DO NOTHING)→ `upsert_water_sources` + test_idempotent ✓
- 坐标系(WGS84 先注 + GCJ02 兜底)→ `--coord` + Task 3 Step 5/6 ✓
- 回滚(--undo 按 batch)→ `delete_batch` + Task 3 Step 2 ✓
- 清洗规则(坐标范围/空值/区名未命中)→ `parse_lnglat`/map_* skip + test ✓
- 验证(DB count + BFF)→ Task 3 Step 4/7 ✓
- 非目标(不动 web/表结构/其它文件)→ Global Constraints + File Structure ✓

**2. Placeholder scan** — 无 TBD/TODO;所有代码块完整可执行;测试有断言;命令有 Expected。

**3. Type consistency** — `upsert_water_sources(db, rows, coord="wgs84") -> {"inserted","conflicts"}` 在 Task 1/2/3 引用一致;`map_detail_row/map_export_row(row)->dict|None` 一致;`delete_batch(db, batch=IMPORT_BATCH)->int` 一致;`IMPORT_BATCH` 常量跨文件引用一致。
