"""Primebot Q1 的姿态、动作和步态定义。所有关节角均为弧度。"""

from __future__ import annotations

import math
from collections.abc import Mapping


ARM_REST: dict[str, float] = {
    "left_shoulder_roll_joint": 0.22,
    "right_shoulder_roll_joint": -0.22,
    "left_elbow_joint": 1.45,
    "right_elbow_joint": 1.45,
}


GESTURES: dict[str, dict] = {
    "wave": {
        "label": "挥手",
        "description": "右手抬起并左右挥动",
        "aliases": ["挥手", "打招呼", "你好"],
        "pose": {
            "right_shoulder_pitch_joint": -2.95,
            "right_shoulder_roll_joint": -1.81,
            "right_shoulder_yaw_joint": 1.38,
            "right_elbow_joint": -0.14,
            "left_shoulder_pitch_joint": 0.0,
            "left_shoulder_roll_joint": 0.22,
            "left_shoulder_yaw_joint": 0.0,
            "left_elbow_joint": 1.45,
        },
        "osc": {"right_shoulder_roll_joint": (0.42, 6.0)},
        "duration_s": 3.0,
        "return_to_rest": True,
    },
    "wave_both": {
        "label": "双手挥",
        "description": "双手同时抬起并挥动",
        "aliases": ["双手挥", "双手打招呼"],
        "pose": {
            "left_shoulder_pitch_joint": -2.95,
            "right_shoulder_pitch_joint": -2.95,
            "left_shoulder_roll_joint": 1.81,
            "right_shoulder_roll_joint": -1.81,
            "left_shoulder_yaw_joint": -1.38,
            "right_shoulder_yaw_joint": 1.38,
            "left_elbow_joint": -0.14,
            "right_elbow_joint": -0.14,
        },
        "osc": {
            "left_shoulder_roll_joint": (0.42, 6.0),
            "right_shoulder_roll_joint": (-0.42, 6.0),
        },
        "duration_s": 3.0,
        "return_to_rest": True,
    },
    "salute": {
        "label": "敬礼",
        "description": "右手完成敬礼姿态",
        "aliases": ["敬礼", "行礼"],
        "pose": {
            "right_shoulder_pitch_joint": math.radians(-12.17),
            "right_shoulder_roll_joint": math.radians(-92.22),
            "right_shoulder_yaw_joint": math.radians(-85.0),
            "right_elbow_joint": math.radians(-45.0),
            "waist_yaw_joint": math.radians(9.25),
        },
        "osc": {},
        "duration_s": 2.5,
        "return_to_rest": True,
    },
    "heart": {
        "label": "比心",
        "description": "双手在头顶组成心形",
        "aliases": ["比心", "爱心"],
        "pose": {
            "left_shoulder_pitch_joint": -2.73,
            "right_shoulder_pitch_joint": -2.73,
            "left_shoulder_roll_joint": 0.80,
            "right_shoulder_roll_joint": -0.80,
            "left_shoulder_yaw_joint": -1.22,
            "right_shoulder_yaw_joint": 1.22,
            "left_elbow_joint": -0.2,
            "right_elbow_joint": -0.2,
        },
        "osc": {},
        "duration_s": 2.5,
        "return_to_rest": True,
    },
    "cheer": {
        "label": "加油",
        "description": "右手举起并做加油动作",
        "aliases": ["加油", "鼓励"],
        "pose": {
            "right_shoulder_pitch_joint": -0.04,
            "right_shoulder_roll_joint": -2.39,
            "right_shoulder_yaw_joint": -0.76,
            "right_elbow_joint": 0.56,
            "left_shoulder_roll_joint": 0.25,
            "left_elbow_joint": 1.4,
        },
        "osc": {"right_shoulder_pitch_joint": (0.32, 6.5)},
        "duration_s": 2.5,
        "return_to_rest": True,
    },
    "dance": {
        "label": "舞动",
        "description": "双臂和腰部按不同节奏摆动",
        "aliases": ["舞动", "跳舞"],
        "pose": {
            "left_shoulder_roll_joint": 0.55,
            "right_shoulder_roll_joint": -0.55,
            "left_shoulder_pitch_joint": -0.9,
            "right_shoulder_pitch_joint": -0.9,
            "left_elbow_joint": -0.25,
            "right_elbow_joint": -0.25,
            "waist_yaw_joint": 0.0,
        },
        "osc": {
            "left_shoulder_pitch_joint": (0.65, 3.0),
            "right_shoulder_pitch_joint": (0.65, 4.5),
            "left_elbow_joint": (0.45, 3.0),
            "right_elbow_joint": (0.45, 4.5),
            "waist_yaw_joint": (0.35, 3.0),
        },
        "duration_s": 4.0,
        "return_to_rest": True,
    },
    "cha_cha": {
        "label": "cha-cha",
        "description": "恰恰基本步：胯部左右摆动，双臂交替推送",
        "aliases": ["cha-cha", "cha cha", "恰恰", "恰恰舞"],
        "pose": {
            "left_shoulder_pitch_joint": -0.55,
            "right_shoulder_pitch_joint": -0.55,
            "left_shoulder_roll_joint": 0.30,
            "right_shoulder_roll_joint": -0.30,
            "left_shoulder_yaw_joint": -0.15,
            "right_shoulder_yaw_joint": 0.15,
            "left_elbow_joint": 1.05,
            "right_elbow_joint": 1.05,
            "waist_roll_joint": 0.0,
            "waist_yaw_joint": 0.0,
        },
        # 胯摆按 120 bpm 一拍一次（ω = 2π），roll 与 yaw 相差四分之一周做出画圆；
        # 手臂在同一个拍点上前后反相推拉，肘部走双倍频对应恰恰的「快-快-快」三连
        "osc": {
            "waist_roll_joint": (0.13, 6.28),
            "waist_yaw_joint": (0.22, 6.28, math.pi / 2),
            "left_shoulder_pitch_joint": (0.30, 6.28),
            "right_shoulder_pitch_joint": (0.30, 6.28, math.pi),
            "left_shoulder_roll_joint": (0.12, 6.28, math.pi),
            "right_shoulder_roll_joint": (-0.12, 6.28),
            "left_elbow_joint": (0.25, 12.57),
            "right_elbow_joint": (0.25, 12.57, math.pi / 2),
        },
        "duration_s": 4.0,
        "return_to_rest": True,
    },
    "stretch": {
        "label": "伸懒腰",
        "description": "双臂举过头顶并缓慢舒展",
        "aliases": ["伸懒腰", "舒展"],
        "pose": {
            "left_shoulder_roll_joint": 0.22,
            "right_shoulder_roll_joint": -0.22,
            "left_shoulder_pitch_joint": -3.03,
            "right_shoulder_pitch_joint": -3.03,
            "left_shoulder_yaw_joint": -0.28,
            "right_shoulder_yaw_joint": 0.28,
            "left_elbow_joint": 0.48,
            "right_elbow_joint": 0.48,
        },
        "osc": {
            "left_shoulder_roll_joint": (0.06, 1.0),
            "right_shoulder_roll_joint": (-0.06, 1.0),
            "left_elbow_joint": (0.1, 1.0),
            "right_elbow_joint": (0.1, 1.0),
        },
        "duration_s": 3.0,
        "return_to_rest": True,
    },
}


# Expressive browser gestures; also checked against the Q1 model limits.
GESTURES.update({ 'surprised': {'label': '惊讶',
               'description': '双臂张开并短暂停顿，缓慢收回',
               'aliases': ['惊讶', '吃惊', '吓一跳'],
               'mood': 'alert',
               'pose': {'left_shoulder_pitch_joint': -0.65,
                        'right_shoulder_pitch_joint': -0.65,
                        'left_shoulder_roll_joint': 1.0,
                        'right_shoulder_roll_joint': -1.0,
                        'left_elbow_joint': 0.75,
                        'right_elbow_joint': 0.75},
               'osc': {},
               'duration_s': 2.6,
               'return_to_rest': True},
 'hug': {'label': '拥抱',
         'description': '双臂向前展开后轻收，保持拥抱再放下',
         'aliases': ['拥抱', '抱抱', '抱一下', '安慰'],
         'mood': 'happy',
         'pose': {'left_shoulder_pitch_joint': -1.25,
                  'right_shoulder_pitch_joint': -1.25,
                  'left_shoulder_roll_joint': 0.72,
                  'right_shoulder_roll_joint': -0.72,
                  'left_shoulder_yaw_joint': -0.25,
                  'right_shoulder_yaw_joint': 0.25,
                  'left_elbow_joint': 0.7,
                  'right_elbow_joint': 0.7},
         'osc': {},
         'duration_s': 4.0,
         'return_to_rest': True},
 'refuse': {'label': '摆手拒绝',
            'description': '右手抬起向外摆动两次，表达拒绝后放下',
            'aliases': ['摆手拒绝', '拒绝', '不要', '不行'],
            'mood': 'focus',
            'pose': {'right_shoulder_pitch_joint': -1.3,
                     'right_shoulder_roll_joint': -0.65,
                     'right_shoulder_yaw_joint': 0.25,
                     'right_elbow_joint': -0.55},
            'osc': {'right_shoulder_yaw_joint': (0.3, 5.0)},
            'duration_s': 3.0,
            'return_to_rest': True}
})


PRESETS: dict[str, dict] = {
    "stand": {
        "label": "站立",
        "pose": dict(ARM_REST),
        "base_dz": 0.0,
    },
    "tpose": {
        "label": "平举",
        "pose": {
            "left_shoulder_roll_joint": 1.45,
            "right_shoulder_roll_joint": -1.45,
            "left_elbow_joint": 0.0,
            "right_elbow_joint": 0.0,
        },
        "base_dz": 0.0,
    },
    "squat": {
        "label": "半蹲",
        "pose": {
            "left_hip_pitch_joint": -0.85,
            "right_hip_pitch_joint": -0.85,
            "left_knee_joint": 1.55,
            "right_knee_joint": 1.55,
            "left_ankle_pitch_joint": -0.76,
            "right_ankle_pitch_joint": -0.76,
            "left_shoulder_roll_joint": 0.3,
            "right_shoulder_roll_joint": -0.3,
            "left_elbow_joint": 1.4,
            "right_elbow_joint": 1.4,
        },
        "base_dz": -0.085,
    },
    "hands_up": {
        "label": "举手",
        "pose": {
            "left_shoulder_pitch_joint": -2.95,
            "right_shoulder_pitch_joint": -2.95,
            "left_shoulder_roll_joint": 1.81,
            "right_shoulder_roll_joint": -1.81,
            "left_shoulder_yaw_joint": -1.38,
            "right_shoulder_yaw_joint": 1.38,
            "left_elbow_joint": -0.14,
            "right_elbow_joint": -0.14,
        },
        "base_dz": 0.0,
    },
    "reach": {
        "label": "伸手",
        "pose": {
            "right_shoulder_pitch_joint": 0.05,
            "right_shoulder_roll_joint": -0.05,
            "right_elbow_joint": -0.15,
            "left_shoulder_roll_joint": 0.2,
            "left_elbow_joint": 1.35,
        },
        "base_dz": 0.0,
    },
}


GAITS: dict[str, dict] = {
    "walk": {
        "label": "行走",
        "hip": 0.35,
        "knee": 0.55,
        "arm": 0.45,
        "waist": 0.12,
        "freq": 1.1,
        "elbow": 1.45,
    },
    "march": {
        "label": "踏步",
        "hip": 0.3,
        "knee": 0.8,
        "arm": 0.5,
        "waist": 0.06,
        "freq": 1.8,
        "elbow": -0.15,
    },
}

GAIT_STOP = {"id": "off", "label": "停止", "freq": 0.0}


def gesture_metadata() -> list[dict]:
    return [
        {
            "id": motion_id,
            "label": motion["label"],
            "description": motion["description"],
            "aliases": list(motion["aliases"]),
            "duration_s": float(motion["duration_s"]),
        }
        for motion_id, motion in GESTURES.items()
    ]


def validate_motion_library(
    joint_names: set[str],
    joint_ranges: Mapping[str, list[float] | None],
) -> None:
    """检查动作定义和模型是否匹配；发现错误时一次性报告全部问题。"""
    errors: list[str] = []

    def check_value(owner: str, joint: str, value: object) -> float | None:
        if joint not in joint_names:
            errors.append(f"{owner} 引用了模型中不存在的关节 {joint}")
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            errors.append(f"{owner}.{joint} 不是数值：{value!r}")
            return None
        if not math.isfinite(number):
            errors.append(f"{owner}.{joint} 不是有限数值：{number!r}")
            return None
        return number

    for motion_id, motion in GESTURES.items():
        owner = f"动作 {motion_id}"
        duration = motion.get("duration_s")
        try:
            valid_duration = math.isfinite(float(duration)) and float(duration) > 0
        except (TypeError, ValueError):
            valid_duration = False
        if not valid_duration:
            errors.append(f"{owner} 的 duration_s 必须大于 0")

        pose = motion.get("pose") or {}
        osc = motion.get("osc") or {}
        for joint, value in pose.items():
            base = check_value(owner, joint, value)
            if base is None:
                continue
            amplitude = 0.0
            if joint in osc:
                spec = osc[joint]
                if not isinstance(spec, (tuple, list)) or len(spec) not in (2, 3):
                    errors.append(f"{owner}.{joint} 的 osc 必须是 (幅值, 角频率[, 初相])")
                    continue
                values = [check_value(owner, joint, item) for item in spec]
                if any(item is None for item in values):
                    continue
                amplitude = abs(float(values[0]))
            limits = joint_ranges.get(joint)
            if limits and (base - amplitude < limits[0] or base + amplitude > limits[1]):
                errors.append(
                    f"{owner}.{joint} 范围 [{base - amplitude:.4f}, {base + amplitude:.4f}] "
                    f"超出模型限位 [{limits[0]:.4f}, {limits[1]:.4f}]"
                )
        for joint in osc.keys() - pose.keys():
            errors.append(f"{owner}.{joint} 定义了 osc，但 pose 中没有该关节")

    for preset_id, preset in PRESETS.items():
        owner = f"姿态 {preset_id}"
        for joint, value in (preset.get("pose") or {}).items():
            number = check_value(owner, joint, value)
            limits = joint_ranges.get(joint)
            if number is not None and limits and not limits[0] <= number <= limits[1]:
                errors.append(
                    f"{owner}.{joint}={number:.4f} 超出模型限位 "
                    f"[{limits[0]:.4f}, {limits[1]:.4f}]"
                )

    for joint, value in ARM_REST.items():
        check_value("自然站姿", joint, value)

    for gait_id, gait in GAITS.items():
        owner = f"步态 {gait_id}"
        checks: dict[str, tuple[float, float]] = {}
        for side in ("left", "right"):
            checks[f"{side}_hip_pitch_joint"] = (-float(gait["hip"]), float(gait["hip"]))
            checks[f"{side}_knee_joint"] = (0.0, float(gait["knee"]))
            checks[f"{side}_ankle_pitch_joint"] = (-0.45 * float(gait["knee"]), 0.0)
            checks[f"{side}_shoulder_pitch_joint"] = (-float(gait["arm"]), float(gait["arm"]))
            checks[f"{side}_shoulder_roll_joint"] = (
                0.22 if side == "left" else -0.22,
                0.22 if side == "left" else -0.22,
            )
            checks[f"{side}_shoulder_yaw_joint"] = (0.0, 0.0)
            checks[f"{side}_elbow_joint"] = (float(gait["elbow"]), float(gait["elbow"]))
        checks["waist_yaw_joint"] = (-float(gait["waist"]), float(gait["waist"]))
        checks["waist_roll_joint"] = (0.0, 0.0)
        for joint, (low, high) in checks.items():
            if check_value(owner, joint, low) is None:
                continue
            limits = joint_ranges.get(joint)
            if limits and (low < limits[0] or high > limits[1]):
                errors.append(
                    f"{owner}.{joint} 范围 [{low:.4f}, {high:.4f}] "
                    f"超出模型限位 [{limits[0]:.4f}, {limits[1]:.4f}]"
                )

    if errors:
        raise ValueError("动作库校验失败：\n- " + "\n- ".join(errors))
