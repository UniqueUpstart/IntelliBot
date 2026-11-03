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
    "description": "右手抬起并左右挥动",
    "aliases": [
      "挥手",
      "打招呼",
      "你好"
    ],
    "mood": "happy",
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
    "description": "双手同时抬起并挥动",
    "aliases": [
      "双手挥",
      "双手打招呼"
    ],
    "mood": "happy",
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
    "description": "右手完成敬礼姿态",
    "aliases": [
      "敬礼",
      "行礼"
    ],
    "mood": "calm",
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
    "description": "双手在头顶组成心形",
    "aliases": [
      "比心",
      "爱心"
    ],
    "mood": "happy",
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
    "description": "右手举起并做加油动作",
    "aliases": [
      "加油",
      "鼓励"
    ],
    "mood": "happy",
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
    "description": "双臂和腰部按不同节奏摆动",
    "aliases": [
      "舞动",
      "跳舞"
    ],
    "mood": "happy",
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
  "cha_cha": {
    "label": "cha-cha",
    "description": "恰恰基本步：胯部左右摆动，双臂交替推送",
    "aliases": [
      "cha-cha",
      "cha cha",
      "恰恰",
      "恰恰舞"
    ],
    "mood": "happy",
    "duration": 4.0,
    "pose": {
      "left_shoulder_pitch_joint": -0.55,
      "right_shoulder_pitch_joint": -0.55,
      "left_shoulder_roll_joint": 0.3,
      "right_shoulder_roll_joint": -0.3,
      "left_shoulder_yaw_joint": -0.15,
      "right_shoulder_yaw_joint": 0.15,
      "left_elbow_joint": 1.05,
      "right_elbow_joint": 1.05,
      "waist_roll_joint": 0.0,
      "waist_yaw_joint": 0.0
    },
    "oscillation": {
      "waist_roll_joint": [
        0.13,
        6.28
      ],
      "waist_yaw_joint": [
        0.22,
        6.28,
        1.5707963267948966
      ],
      "left_shoulder_pitch_joint": [
        0.3,
        6.28
      ],
      "right_shoulder_pitch_joint": [
        0.3,
        6.28,
        3.141592653589793
      ],
      "left_shoulder_roll_joint": [
        0.12,
        6.28,
        3.141592653589793
      ],
      "right_shoulder_roll_joint": [
        -0.12,
        6.28
      ],
      "left_elbow_joint": [
        0.25,
        12.57
      ],
      "right_elbow_joint": [
        0.25,
        12.57,
        1.5707963267948966
      ]
    }
  },
  "stretch": {
    "label": "伸懒腰",
    "description": "双臂举过头顶并缓慢舒展",
    "aliases": [
      "伸懒腰",
      "舒展"
    ],
    "mood": "calm",
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
  },
  "surprised": {
    "label": "惊讶",
    "description": "双臂张开并短暂停顿，缓慢收回",
    "aliases": [
      "惊讶",
      "吃惊",
      "吓一跳"
    ],
    "mood": "alert",
    "duration": 2.6,
    "pose": {
      "left_shoulder_pitch_joint": -0.65,
      "right_shoulder_pitch_joint": -0.65,
      "left_shoulder_roll_joint": 1.0,
      "right_shoulder_roll_joint": -1.0,
      "left_elbow_joint": 0.75,
      "right_elbow_joint": 0.75
    },
    "oscillation": {}
  },
  "hug": {
    "label": "拥抱",
    "description": "双臂向前展开后轻收，保持拥抱再放下",
    "aliases": [
      "拥抱",
      "抱抱",
      "抱一下",
      "安慰"
    ],
    "mood": "happy",
    "duration": 4.0,
    "pose": {
      "left_shoulder_pitch_joint": -1.25,
      "right_shoulder_pitch_joint": -1.25,
      "left_shoulder_roll_joint": 0.72,
      "right_shoulder_roll_joint": -0.72,
      "left_shoulder_yaw_joint": -0.25,
      "right_shoulder_yaw_joint": 0.25,
      "left_elbow_joint": 0.7,
      "right_elbow_joint": 0.7
    },
    "oscillation": {}
  },
  "refuse": {
    "label": "摆手拒绝",
    "description": "右手抬起向外摆动两次，表达拒绝后放下",
    "aliases": [
      "摆手拒绝",
      "拒绝",
      "不要",
      "不行"
    ],
    "mood": "focus",
    "duration": 3.0,
    "pose": {
      "right_shoulder_pitch_joint": -1.3,
      "right_shoulder_roll_joint": -0.65,
      "right_shoulder_yaw_joint": 0.25,
      "right_elbow_joint": -0.55
    },
    "oscillation": {
      "right_shoulder_yaw_joint": [
        0.3,
        5.0
      ]
    }
  }
});

export const HOME_MOTIONS = Object.entries(Q1_MOTIONS).map(([id, motion]) => ({
  id,
  label: motion.label,
  duration: motion.duration,
  description: motion.description,
  aliases: motion.aliases,
  mood: motion.mood,
}));
