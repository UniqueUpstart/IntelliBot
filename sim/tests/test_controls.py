"""Regression checks: base lease isolation and stop pose preservation.

Run from the repository: .venv/bin/python -m unittest discover -s sim/tests -v
"""
import sys
import time
import unittest
from argparse import Namespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mujoco_bridge import Sim, find_model, PRESETS

class ControlsTest(unittest.TestCase):
    def setUp(self):
        args = Namespace(dynamic=False, headless=False, joint_speed=3.0,
                         ctrl_hz=100.0, kp=60.0, kd=4.0, watchdog_s=0.5)
        self.sim = Sim(find_model(None), args)

    def test_joint_command_does_not_renew_base_lease(self):
        s = self.sim
        s.base_cmd[:] = [0.3, 0, 0]
        s.last_base_cmd_at = time.monotonic() - 1.0
        s.apply_pose({"left_elbow_joint": 1.4}, 300)
        before = s.snapshot()["base"]["x"]
        s.step(0.01)
        self.assertEqual(s.snapshot()["base"]["x"], before)
        self.assertEqual(list(s.base_cmd), [0, 0, 0])

    def test_fresh_base_command_moves(self):
        s = self.sim
        s.base_cmd[:] = [0.3, 0, 0]
        s.last_base_cmd_at = time.monotonic()
        before = s.snapshot()["base"]["x"]
        s.step(0.01)
        self.assertGreater(s.snapshot()["base"]["x"], before)

    def test_stop_during_squat_holds_current_height_and_joints(self):
        s = self.sim
        s.apply_preset("squat")
        for _ in range(12): s.step(0.01)
        before = s.snapshot()
        s.stop()
        for _ in range(50): s.step(0.01)
        after = s.snapshot()
        self.assertEqual(after["base"], before["base"])
        self.assertEqual(after["joints"], before["joints"])

    def test_squat_contract(self):
        s = self.sim
        s.apply_preset("squat")
        for _ in range(200): s.step(0.01)
        state = s.snapshot()
        self.assertAlmostEqual(state["joints"]["left_knee_joint"], PRESETS["squat"]["pose"]["left_knee_joint"], places=3)
        self.assertAlmostEqual(state["joints"]["right_knee_joint"], PRESETS["squat"]["pose"]["right_knee_joint"], places=3)
        self.assertGreaterEqual(state["base"]["z"], s.home_z + PRESETS["squat"]["base_dz"] - 0.001)
        self.assertLess(state["base"]["z"], s.home_z - 0.02)
        self.assertGreater(state["foot_clearance"], -0.005)

if __name__ == "__main__": unittest.main()
