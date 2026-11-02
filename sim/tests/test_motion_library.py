from __future__ import annotations

import argparse
import subprocess
import sys
import time
import unittest
from pathlib import Path

import mujoco

SIM_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SIM_DIR))

from motion_library import ARM_REST, GESTURES, PRESETS, validate_motion_library
from mujoco_bridge import Sim, scan_joints


MODEL_PATH = SIM_DIR / "assets" / "q1-urdf" / "xml" / "q1_v3_mc.xml"


class MotionLibraryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.model = mujoco.MjModel.from_xml_path(str(MODEL_PATH))
        cls.qadr, _, cls.ranges = scan_joints(cls.model)

    def test_library_matches_q1_model(self) -> None:
        validate_motion_library(set(self.qadr), self.ranges)
        self.assertEqual(
            set(GESTURES),
            {"wave", "wave_both", "salute", "heart", "cheer", "dance", "stretch"},
        )
        self.assertEqual(set(PRESETS), {"stand", "tpose", "squat", "hands_up", "reach"})

    def test_web_motion_data_is_current(self) -> None:
        generator = SIM_DIR.parent / "scripts" / "generate_web_motion_data.py"
        result = subprocess.run(
            [sys.executable, str(generator), "--check"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_invalid_joint_is_reported(self) -> None:
        original = GESTURES["salute"]["pose"]
        try:
            GESTURES["salute"]["pose"] = {**original, "missing_joint": 0.0}
            with self.assertRaisesRegex(ValueError, "missing_joint"):
                validate_motion_library(set(self.qadr), self.ranges)
        finally:
            GESTURES["salute"]["pose"] = original

    def test_gesture_expires_and_stop_preserves_base_position(self) -> None:
        args = argparse.Namespace(
            dynamic=False,
            headless=False,
            joint_speed=2.5,
            ctrl_hz=1000.0,
            kp=60.0,
            kd=3.0,
            watchdog_s=0.8,
        )
        sim = Sim(str(MODEL_PATH), args)
        sim.apply_gesture("dance", 1.0)
        self.assertEqual(sim.gesture["name"], "dance")
        sim.apply_gesture("salute", 1.0)
        self.assertEqual(sim.gesture["name"], "salute")
        sim.gesture["t0"] = time.time() - GESTURES["salute"]["duration_s"] - 0.1
        sim.step(0.001)
        self.assertIsNone(sim.gesture)
        for joint, value in sim.target.items():
            self.assertAlmostEqual(value, ARM_REST.get(joint, 0.0))

        base_x = sim.free_qadr
        self.assertIsNotNone(base_x)
        sim.data.qpos[base_x] += 0.4
        moved_x = float(sim.data.qpos[base_x])
        sim.stop()
        self.assertAlmostEqual(float(sim.data.qpos[base_x]), moved_x)


if __name__ == "__main__":
    unittest.main()
