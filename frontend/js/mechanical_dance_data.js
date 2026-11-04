export const MECHANICAL_DANCE_REST_POSE = Object.freeze({
  waist_roll_joint: 0,
  waist_yaw_joint: 0,
  left_shoulder_pitch_joint: 0,
  left_shoulder_roll_joint: 0.22,
  left_shoulder_yaw_joint: 0,
  left_elbow_joint: 1.45,
  right_shoulder_pitch_joint: 0,
  right_shoulder_roll_joint: -0.22,
  right_shoulder_yaw_joint: 0,
  right_elbow_joint: 1.45,
  left_hip_pitch_joint: 0,
  left_hip_roll_joint: 0,
  left_hip_yaw_joint: 0,
  left_knee_joint: 0,
  left_ankle_pitch_joint: 0,
  left_ankle_roll_joint: 0,
  right_hip_pitch_joint: 0,
  right_hip_roll_joint: 0,
  right_hip_yaw_joint: 0,
  right_knee_joint: 0,
  right_ankle_pitch_joint: 0,
  right_ankle_roll_joint: 0,
});

const JOINT_NAMES = Object.keys(MECHANICAL_DANCE_REST_POSE);

function buildTracks(endBeat, frames) {
  const tracks = Object.fromEntries(
    JOINT_NAMES.map((joint) => [joint, [[0, MECHANICAL_DANCE_REST_POSE[joint]]]]),
  );
  frames.forEach(([beat, pose]) => {
    Object.entries(pose).forEach(([joint, value]) => {
      if (!Object.prototype.hasOwnProperty.call(MECHANICAL_DANCE_REST_POSE, joint)) {
        throw new Error(`未知关节轨道: ${joint}`);
      }
      const track = tracks[joint];
      const last = track[track.length - 1];
      if (last[0] === beat) last[1] = value;
      else track.push([beat, value]);
    });
  });
  JOINT_NAMES.forEach((joint) => {
    const track = tracks[joint];
    const last = track[track.length - 1];
    if (last[0] === endBeat) last[1] = MECHANICAL_DANCE_REST_POSE[joint];
    else track.push([endBeat, MECHANICAL_DANCE_REST_POSE[joint]]);
  });
  return tracks;
}

const PREP = {
  waist_roll_joint: 0.02,
  waist_yaw_joint: -0.05,
  left_shoulder_pitch_joint: 0.24,
  left_shoulder_roll_joint: 0.14,
  left_elbow_joint: 1.30,
  right_shoulder_pitch_joint: 0.24,
  right_shoulder_roll_joint: -0.14,
  right_elbow_joint: 1.30,
  left_hip_pitch_joint: -0.14,
  left_knee_joint: 0.34,
  left_ankle_pitch_joint: -0.14,
  right_hip_pitch_joint: -0.14,
  right_knee_joint: 0.34,
  right_ankle_pitch_joint: -0.14,
};

const HIT_LEFT = {
  waist_roll_joint: -0.18,
  waist_yaw_joint: 0.42,
  left_shoulder_pitch_joint: -1.58,
  left_shoulder_roll_joint: 0.35,
  left_shoulder_yaw_joint: -0.25,
  left_elbow_joint: 0.18,
  right_shoulder_pitch_joint: -0.25,
  right_shoulder_roll_joint: -0.70,
  right_shoulder_yaw_joint: 0.55,
  right_elbow_joint: 1.20,
  left_hip_pitch_joint: -0.12,
  left_hip_roll_joint: 0.10,
  left_hip_yaw_joint: 0.08,
  left_knee_joint: 0.38,
  left_ankle_pitch_joint: -0.16,
  left_ankle_roll_joint: 0.10,
  right_hip_pitch_joint: -0.04,
  right_hip_roll_joint: -0.04,
  right_hip_yaw_joint: -0.03,
  right_knee_joint: 0.14,
  right_ankle_pitch_joint: -0.06,
  right_ankle_roll_joint: -0.04,
};

const HIT_RIGHT = {
  waist_roll_joint: 0.18,
  waist_yaw_joint: -0.42,
  left_shoulder_pitch_joint: -0.25,
  left_shoulder_roll_joint: 0.70,
  left_shoulder_yaw_joint: -0.55,
  left_elbow_joint: 1.20,
  right_shoulder_pitch_joint: -1.58,
  right_shoulder_roll_joint: -0.35,
  right_shoulder_yaw_joint: 0.25,
  right_elbow_joint: 0.18,
  left_hip_pitch_joint: -0.04,
  left_hip_roll_joint: 0.04,
  left_hip_yaw_joint: 0.03,
  left_knee_joint: 0.14,
  left_ankle_pitch_joint: -0.06,
  left_ankle_roll_joint: 0.04,
  right_hip_pitch_joint: -0.12,
  right_hip_roll_joint: -0.10,
  right_hip_yaw_joint: -0.08,
  right_knee_joint: 0.38,
  right_ankle_pitch_joint: -0.16,
  right_ankle_roll_joint: -0.10,
};

const BOX = {
  waist_roll_joint: 0.05,
  waist_yaw_joint: 0,
  left_shoulder_pitch_joint: -1.35,
  left_shoulder_roll_joint: 0.95,
  left_shoulder_yaw_joint: -0.45,
  left_elbow_joint: 0.82,
  right_shoulder_pitch_joint: -1.35,
  right_shoulder_roll_joint: -0.95,
  right_shoulder_yaw_joint: 0.45,
  right_elbow_joint: 0.82,
  left_hip_pitch_joint: -0.20,
  left_hip_roll_joint: 0.08,
  left_hip_yaw_joint: 0.05,
  left_knee_joint: 0.50,
  left_ankle_pitch_joint: -0.20,
  left_ankle_roll_joint: 0.08,
  right_hip_pitch_joint: -0.20,
  right_hip_roll_joint: -0.08,
  right_hip_yaw_joint: -0.05,
  right_knee_joint: 0.50,
  right_ankle_pitch_joint: -0.20,
  right_ankle_roll_joint: -0.08,
};

const BOX_TWIST = {
  waist_roll_joint: -0.22,
  waist_yaw_joint: 0.34,
  left_shoulder_pitch_joint: -1.62,
  left_shoulder_roll_joint: 1.08,
  left_shoulder_yaw_joint: -0.52,
  left_elbow_joint: 0.70,
  right_shoulder_pitch_joint: -1.18,
  right_shoulder_roll_joint: -0.82,
  right_shoulder_yaw_joint: 0.38,
  right_elbow_joint: 0.92,
  left_hip_pitch_joint: -0.24,
  left_hip_roll_joint: 0.12,
  left_hip_yaw_joint: 0.08,
  left_knee_joint: 0.56,
  left_ankle_pitch_joint: -0.22,
  left_ankle_roll_joint: 0.10,
  right_hip_pitch_joint: -0.16,
  right_hip_roll_joint: -0.06,
  right_hip_yaw_joint: -0.04,
  right_knee_joint: 0.42,
  right_ankle_pitch_joint: -0.18,
  right_ankle_roll_joint: -0.06,
};

const TURN_HIT = {
  waist_roll_joint: 0.16,
  waist_yaw_joint: -0.38,
  left_shoulder_pitch_joint: -2.52,
  left_shoulder_roll_joint: 1.25,
  left_shoulder_yaw_joint: -0.30,
  left_elbow_joint: 0.20,
  right_shoulder_pitch_joint: -0.45,
  right_shoulder_roll_joint: -0.50,
  right_shoulder_yaw_joint: 0.50,
  right_elbow_joint: 1.15,
  left_hip_pitch_joint: -0.16,
  left_hip_roll_joint: 0.12,
  left_hip_yaw_joint: 0.10,
  left_knee_joint: 0.44,
  left_ankle_pitch_joint: -0.18,
  left_ankle_roll_joint: 0.10,
  right_hip_pitch_joint: -0.08,
  right_hip_roll_joint: -0.04,
  right_hip_yaw_joint: -0.04,
  right_knee_joint: 0.22,
  right_ankle_pitch_joint: -0.10,
  right_ankle_roll_joint: -0.04,
};

const FRONT_HIT = {
  waist_roll_joint: -0.20,
  waist_yaw_joint: 0.45,
  left_shoulder_pitch_joint: -1.55,
  left_shoulder_roll_joint: 1.48,
  left_shoulder_yaw_joint: -0.10,
  left_elbow_joint: 0.08,
  right_shoulder_pitch_joint: -0.15,
  right_shoulder_roll_joint: -0.20,
  right_shoulder_yaw_joint: 0.10,
  right_elbow_joint: 1.42,
  left_hip_pitch_joint: -0.08,
  left_hip_roll_joint: 0.04,
  left_hip_yaw_joint: 0.03,
  left_knee_joint: 0.22,
  left_ankle_pitch_joint: -0.10,
  left_ankle_roll_joint: 0.04,
  right_hip_pitch_joint: -0.24,
  right_hip_roll_joint: -0.12,
  right_hip_yaw_joint: -0.08,
  right_knee_joint: 0.58,
  right_ankle_pitch_joint: -0.22,
  right_ankle_roll_joint: -0.10,
};

/*
 * 100 BPM，20 拍。每段造型快速到位后保持，不使用连续挥臂：
 * 准备 -> 左/右定格 -> 方形 pop -> 扭腰 hold -> 90 度机械转身 -> 关机收势。
 */
export const MECHANICAL_DANCE = Object.freeze({
  id: 'mechanical_dance',
  label: '机械舞',
  description: '12秒机械舞：100 BPM，短促snap到位、分段定格、植根几何造型、机械转身和关机收势。',
  aliases: ['机械舞', '机器人舞', '机器舞', 'popping', 'pop舞'],
  category: 'dance',
  easing: 'snap',
  duration: 12,
  bpm: 100,
  loop: false,
  returnToRest: true,
  root: {
    easing: 'smooth',
    side: [
      [0, 0], [3, -0.03], [7, 0.04], [11, -0.03],
      [14, 0.04], [17, -0.03], [20, 0],
    ],
    yaw: [
      [0, 0], [13.5, 0], [14.5, 90], [16.5, 90], [18.5, 0], [20, 0],
    ],
  },
  contacts: [
    {fromBeat: 0, toBeat: 14, foot: 'both'},
    {fromBeat: 14, toBeat: 17, foot: 'left'},
    {fromBeat: 17, toBeat: 20, foot: 'both'},
  ],
  tracks: buildTracks(20, [
    [2, PREP],
    [3, HIT_LEFT],
    [6, HIT_LEFT],
    [7, HIT_RIGHT],
    [10, HIT_RIGHT],
    [11, BOX],
    [13, BOX],
    [14, BOX_TWIST],
    [15, TURN_HIT],
    [17, TURN_HIT],
    [18, FRONT_HIT],
    [19.5, FRONT_HIT],
  ]),
});
