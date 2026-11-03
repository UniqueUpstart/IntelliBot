from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from motion_library import ARM_REST, GESTURES


WEB_JOINTS = (
    "waist_roll_joint",
    "waist_yaw_joint",
    "left_shoulder_pitch_joint",
    "left_shoulder_roll_joint",
    "left_shoulder_yaw_joint",
    "left_elbow_joint",
    "right_shoulder_pitch_joint",
    "right_shoulder_roll_joint",
    "right_shoulder_yaw_joint",
    "right_elbow_joint",
)
OUTPUT = ROOT / "frontend" / "js" / "q1_motion_data.js"


def javascript() -> str:
    rest = {joint: float(ARM_REST.get(joint, 0.0)) for joint in WEB_JOINTS}
    motions = {
        motion_id: {
            "label": motion["label"],
            "description": motion.get("description", motion["label"]),
            "aliases": motion.get("aliases", []),
            "mood": motion.get("mood"),
            "duration": float(motion["duration_s"]),
            "pose": {joint: float(value) for joint, value in motion["pose"].items()},
            "oscillation": {
                joint: [float(value) for value in values]
                for joint, values in motion.get("osc", {}).items()
            },
        }
        for motion_id, motion in GESTURES.items()
    }
    rest_json = json.dumps(rest, ensure_ascii=False, indent=2)
    motions_json = json.dumps(motions, ensure_ascii=False, indent=2)
    return (
        "// Generated from sim/motion_library.py. Run "
        "`python scripts/generate_web_motion_data.py` after editing the library.\n"
        f"export const Q1_REST_POSE = Object.freeze({rest_json});\n\n"
        f"export const Q1_MOTIONS = Object.freeze({motions_json});\n\n"
        "export const HOME_MOTIONS = Object.entries(Q1_MOTIONS).map(([id, motion]) => ({\n"
        "  id,\n"
        "  label: motion.label,\n"
        "  duration: motion.duration,\n"
        "  description: motion.description,\n"
        "  aliases: motion.aliases,\n"
        "  mood: motion.mood,\n"
        "}));\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the web projection of the Q1 motion library")
    parser.add_argument("--check", action="store_true", help="fail if the generated file is outdated")
    args = parser.parse_args()
    content = javascript()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != content:
            print(f"outdated generated file: {OUTPUT}", file=sys.stderr)
            return 1
        return 0
    OUTPUT.write_text(content, encoding="utf-8", newline="\n")
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
