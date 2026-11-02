// Generated from sim/motion_library.py. Run `python scripts/generate_web_motion_data.py` after editing the library.
export const Q1_REST_POSE = Object.freeze({
  "waist_roll_joint": 0.0,
  "waist_yaw_joint": 0.0,
  "left_shoulder_pitch_joint": 0.0,
  "left_shoulder_roll_joint": 0.22,
  "left_shoulder_yaw_joint": 0.0,
  "left_elbow_joint": 1.45,
  "right_shoulder_pitch_joint": 0.0,
  "right_shoulder_roll_joint": -0.22,
  "right_shoulder_yaw_joint": 0.0,
  "right_elbow_joint": 1.45
});

export const Q1_MOTIONS = Object.freeze({
  "wave": {
    "label": "挥手",
    "duration": 3.0,
    "pose": {
      "right_shoulder_pitch_joint": -2.95,
      "right_shoulder_roll_joint": -1.81,
      "right_shoulder_yaw_joint": 1.38,
      "right_elbow_joint": -0.14,
      "left_shoulder_pitch_joint": 0.0,
      "left_shoulder_roll_joint": 0.22,
      "left_shoulder_yaw_joint": 0.0,
      "left_elbow_joint": 1.45
    },
    "oscillation": {
      "right_shoulder_roll_joint": [
        0.42,
        6.0
      ]
    }
  },
  "wave_both": {
    "label": "双手挥",
    "duration": 3.0,
    "pose": {
      "left_shoulder_pitch_joint": -2.95,
      "right_shoulder_pitch_joint": -2.95,
      "left_shoulder_roll_joint": 1.81,
      "right_shoulder_roll_joint": -1.81,
      "left_shoulder_yaw_joint": -1.38,
      "right_shoulder_yaw_joint": 1.38,
      "left_elbow_joint": -0.14,
      "right_elbow_joint": -0.14
    },
    "oscillation": {
      "left_shoulder_roll_joint": [
        0.42,
        6.0
      ],
      "right_shoulder_roll_joint": [
        -0.42,
        6.0
      ]
    }
  },
  "salute": {
    "label": "敬礼",
    "duration": 2.5,
    "pose": {
      "right_shoulder_pitch_joint": -0.2124065699677099,
      "right_shoulder_roll_joint": -1.6095426361891707,
      "right_shoulder_yaw_joint": -1.4835298641951802,
      "right_elbow_joint": -0.7853981633974483,
      "waist_yaw_joint": 0.16144295580947549
    },
    "oscillation": {}
  },
  "heart": {
    "label": "比心",
    "duration": 2.5,
    "pose": {
      "left_shoulder_pitch_joint": -2.73,
      "right_shoulder_pitch_joint": -2.73,
      "left_shoulder_roll_joint": 0.8,
      "right_shoulder_roll_joint": -0.8,
      "left_shoulder_yaw_joint": -1.22,
      "right_shoulder_yaw_joint": 1.22,
      "left_elbow_joint": -0.2,
      "right_elbow_joint": -0.2
    },
    "oscillation": {}
  },
  "cheer": {
    "label": "加油",
    "duration": 2.5,
    "pose": {
      "right_shoulder_pitch_joint": -0.04,
      "right_shoulder_roll_joint": -2.39,
      "right_shoulder_yaw_joint": -0.76,
      "right_elbow_joint": 0.56,
      "left_shoulder_roll_joint": 0.25,
      "left_elbow_joint": 1.4
    },
    "oscillation": {
      "right_shoulder_pitch_joint": [
        0.32,
        6.5
      ]
    }
  },
  "dance": {
    "label": "舞动",
    "duration": 4.0,
    "pose": {
      "left_shoulder_roll_joint": 0.55,
      "right_shoulder_roll_joint": -0.55,
      "left_shoulder_pitch_joint": -0.9,
      "right_shoulder_pitch_joint": -0.9,
      "left_elbow_joint": -0.25,
      "right_elbow_joint": -0.25,
      "waist_yaw_joint": 0.0
    },
    "oscillation": {
      "left_shoulder_pitch_joint": [
        0.65,
        3.0
      ],
      "right_shoulder_pitch_joint": [
        0.65,
        4.5
      ],
      "left_elbow_joint": [
        0.45,
        3.0
      ],
      "right_elbow_joint": [
        0.45,
        4.5
      ],
      "waist_yaw_joint": [
        0.35,
        3.0
      ]
    }
  },
  "stretch": {
    "label": "伸懒腰",
    "duration": 3.0,
    "pose": {
      "left_shoulder_roll_joint": 0.22,
      "right_shoulder_roll_joint": -0.22,
      "left_shoulder_pitch_joint": -3.03,
      "right_shoulder_pitch_joint": -3.03,
      "left_shoulder_yaw_joint": -0.28,
      "right_shoulder_yaw_joint": 0.28,
      "left_elbow_joint": 0.48,
      "right_elbow_joint": 0.48
    },
    "oscillation": {
      "left_shoulder_roll_joint": [
        0.06,
        1.0
      ],
      "right_shoulder_roll_joint": [
        -0.06,
        1.0
      ],
      "left_elbow_joint": [
        0.1,
        1.0
      ],
      "right_elbow_joint": [
        0.1,
        1.0
      ]
    }
  }
});

export const HOME_MOTIONS = Object.entries(Q1_MOTIONS).map(([id, motion]) => ({
  id,
  label: motion.label,
  duration: motion.duration,
}));
