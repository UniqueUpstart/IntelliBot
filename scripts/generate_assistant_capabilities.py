from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "sim"))
sys.path.insert(0, str(ROOT / "scripts"))

from home_actions import HOME_ACTIONS
from motion_library import gesture_metadata


OUTPUT = ROOT / "assistant" / "capabilities.json"
SAFE_ID = re.compile(r"^[a-z][a-z0-9_]*$")


def motion_catalog() -> list[dict]:
    motions = [
        {
            "id": item["id"],
            "name": item["label"],
            "description": item["description"],
            "aliases": list(item["aliases"]),
            "duration": float(item["duration_s"]),
        }
        for item in gesture_metadata()
    ]
    motions.extend(
        {
            "id": item["id"],
            "name": item["name"],
            "description": item["description"],
            "aliases": list(item["aliases"]),
            "duration": float(item["duration_s"]),
        }
        for item in HOME_ACTIONS
    )
    return motions


def validate(capabilities: dict) -> None:
    collections = ("motions", "poses", "views", "emotions")
    ids: dict[str, set[str]] = {}
    for name in collections:
        items = capabilities.get(name)
        if not isinstance(items, list) or not items:
            raise ValueError(f"{name} 必须是非空数组")
        ids[name] = set()
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"{name} 中存在非对象条目")
            item_id = item.get("id")
            if not isinstance(item_id, str) or not SAFE_ID.match(item_id):
                raise ValueError(f"{name} 中存在非法 ID: {item_id!r}")
            if item_id in ids[name]:
                raise ValueError(f"{name} 中存在重复 ID: {item_id}")
            ids[name].add(item_id)

    command_types = capabilities.get("commandTypes")
    if not isinstance(command_types, dict) or not command_types:
        raise ValueError("commandTypes 必须是非空对象")
    for command_type, spec in command_types.items():
        if not SAFE_ID.match(command_type) or not isinstance(spec, dict):
            raise ValueError(f"非法命令类型: {command_type!r}")
        if not spec:
            continue
        collection = spec.get("collection")
        parameter = spec.get("parameter")
        if collection not in ids or not isinstance(parameter, str):
            raise ValueError(f"{command_type} 引用了无效能力集合")


def generated() -> dict:
    if not OUTPUT.exists():
        raise FileNotFoundError(OUTPUT)
    capabilities = json.loads(OUTPUT.read_text(encoding="utf-8"))
    capabilities["version"] = max(1, int(capabilities.get("version", 1)))
    capabilities["motions"] = motion_catalog()
    validate(capabilities)
    return capabilities


def serialized() -> str:
    return json.dumps(generated(), ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate assistant capability manifest")
    parser.add_argument("--check", action="store_true", help="fail if the manifest is stale")
    args = parser.parse_args()
    content = serialized()
    if args.check:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != content:
            print(f"outdated generated file: {OUTPUT}", file=sys.stderr)
            return 1
        return 0
    OUTPUT.write_text(content, encoding="utf-8", newline="\n")
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
