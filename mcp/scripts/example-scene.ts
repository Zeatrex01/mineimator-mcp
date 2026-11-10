// A small, generic project used by the tests and as examples/generic-scene.miproject: one default-skin character
// (a Steve rig with a short wave), a prop folder with one block, and a camera. It is made up for this repository
// and contains nobody's content. Its structure copies what Mine-imator 2.0.2 writes; whether the app opens it
// has not been checked in the app.
import type { Project, Timeline } from "../src/core/project.ts";

const id = (n: number) => `EXAMPLE${String(n).padStart(9, "0")}`;

export const EXAMPLE_IDS = {
  template: id(1),
  blockTemplate: id(2),
  character: id(10),
  body: id(11),
  head: id(12),
  hat: id(13),
  leftArm: id(14),
  rightArm: id(15),
  leftLeg: id(16),
  rightLeg: id(17),
  props: id(20),
  block: id(21),
  camera: id(30),
} as const;

const INHERIT = {
  position: true, rotation: true, scale: true, alpha: false, color: false, texture: false, surface: true,
  subsurface: true, visibility: true, bend: false, rot_point: false, glow_color: true, select: false, pose: false,
};

function base(fields: Partial<Timeline> & Pick<Timeline, "id" | "type" | "parent" | "parent_tree_index">): Timeline {
  return {
    name: "",
    temp: "null",
    color_tag: "null",
    hide: false,
    lock: false,
    ghost: false,
    depth: 0,
    default_values: {},
    keyframes: {},
    lock_bend: true,
    tree_extend: false,
    inherit: { ...INHERIT },
    scale_resize: true,
    rot_point_custom: false,
    rot_point: [0, 0, 0],
    backfaces: false,
    texture_blur: false,
    texture_filtering: false,
    shadows: true,
    ssao: true,
    glow: false,
    glow_texture: true,
    only_render_glow: false,
    glint_mode: 0,
    glint_scale: 1,
    glint_speed: 1,
    glint_strength: 1,
    glint_tex: "default",
    fog: true,
    hq_hiding: false,
    lq_hiding: false,
    blend_mode: "normal",
    alpha_mode: 2,
    ...fields,
  };
}

function part(partName: string, tid: number, parent: string, index: number, keyframes: Timeline["keyframes"] = {}): Timeline {
  return base({
    id: id(tid), type: "bodypart", temp: EXAMPLE_IDS.template, model_part_name: partName, part_of: EXAMPLE_IDS.character,
    parent, parent_tree_index: index, keyframes,
    inherit: { ...INHERIT, alpha: true, color: true, texture: true, rot_point: true },
    scale_resize: false,
  });
}

export function buildExampleScene(): Project {
  const I = EXAMPLE_IDS;
  const character = base({
    id: I.character, type: "char", name: "Example Steve", temp: I.template,
    parts: [I.hat, I.head, I.rightArm, I.leftArm, I.body, I.rightLeg, I.leftLeg],
    default_values: { POS_X: 0, POS_Y: 0, POS_Z: 0 },
    keyframes: { "0": { POS_X: 0, POS_Y: 0, POS_Z: 0, ROT_Z: 30, TRANSITION: "easeinoutsine" } },
    parent: "root", parent_tree_index: 1,
  });
  return {
    format: 34,
    created_in: "2.0.2",
    project: {
      name: "Generic example", author: "", description: "", video_width: 1280, video_height: 720, video_keep_aspect_ratio: false,
      render_settings: "", tempo: 30, grid_rows: 3, grid_columns: 3, view_main_camera: -4, view_second_camera: -5,
      timeline: {
        repeat: false, seamless_repeat: false, intervals_show: true, interval_size: 30, interval_offset: 0, marker: 251,
        list_width: 320, hor_scroll: 0, zoom: 0.25, region_start: "null", region_end: "null", hide_color_tag: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      work_camera: { focus: [0, 0, 16], angle_xy: -25, angle_z: 36, roll: 0, zoom: 55 },
    },
    render: {},
    background: {},
    templates: [
      {
        id: I.template, type: "char", name: "", model_tex: "default", model_tex_material: "default", model_tex_normal: "default",
        model_use_blend_color: false, model_blend_color: "#FFFFFF",
        model: { name: "human", state: { variant: "steve", type: "wide" }, model_version: 1 },
      },
      {
        id: I.blockTemplate, type: "block", name: "",
        block: { name: "stone", state: {}, tex: "default", tex_material: "default", tex_normal: "default", randomize: true, repeat_enable: false, repeat: [1, 1, 1] },
      },
    ],
    timelines: [
      base({ id: I.camera, type: "camera", parent: "root", parent_tree_index: 0, default_values: { POS_X: 40, POS_Y: -120, POS_Z: 30, ROT_X: 5, ROT_Z: 15, CAM_FOV: 40 } }),
      character,
      part("hat", 13, I.head, 0),
      part("head", 12, I.body, 0, { "0": { ROT_X: 5, TRANSITION: "easeinoutsine" }, "15": { ROT_X: -10, TRANSITION: "easeinoutsine" } }),
      part("right_arm", 15, I.body, 1, { "0": { ROT_X: -10, TRANSITION: "easeinoutsine" }, "15": { ROT_X: -150, ROT_Z: 12, TRANSITION: "easeinoutsine" } }),
      part("left_arm", 14, I.body, 2),
      part("body", 11, I.character, 0, { "0": { BEND_ANGLE_X: 4, TRANSITION: "easeinoutsine" } }),
      part("right_leg", 17, I.character, 1),
      part("left_leg", 16, I.character, 2),
      base({ id: I.props, type: "folder", name: "Props", parent: "root", parent_tree_index: 2 }),
      base({
        id: I.block, type: "block", temp: I.blockTemplate, parent: I.props, parent_tree_index: 0,
        default_values: { POS_X: 48, POS_Y: 16, POS_Z: 0 }, keyframes: { "0": { POS_X: 48, POS_Y: 16, POS_Z: 0, ROT_Z: 45 } },
        rot_point: [8, 0, 8],
      }),
    ],
    resources: [],
  };
}
