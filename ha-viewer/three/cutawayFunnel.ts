// The reverse-dome mask of the room cutaway experiment (Phase 8.2a, variant B, owner idea). Pure: no three.js,
// so the math can be checked from a script; the shader in roomCutaway.ts evaluates the same formula (GLSL below).
//
// A ring around the whole house at roof height, its centre pulled down to the focused room's floor centre (the
// apex), gives a funnel: an upside-down dome hanging into the room. For a point at horizontal distance r from the
// apex, with s the distance from the apex to the ring in that direction, the surface height is
//   h(r) = apex + (top − apex) · (r / s)^curve        (r ≤ s; outside the ring nothing is cut)
// Geometry above the surface lies between the camera and the room and is cut away; within `softEdge` above the
// surface it is dithered out, so the cut has a soft edge. curve > 1 is a bowl (flat near the room, steep at the
// ring), curve = 1 a cone.
//
// Reach: from a low camera the line of sight to the apex climbs only tan(elevation) per metre, so the ring must
// lie at least (top − apex) / tan(elevation) away on the camera's side, or the house's outer walls near the room
// stay in the way. When it is closer, the ring is shifted toward the camera by the shortfall (× reach); the shift
// moves the ring's distance along that direction by exactly the same amount.
//
// World metres, y up (three.js world, the viewer's frame).

export type WorldPoint = Readonly<{ x: number; y: number; z: number }>;

export type FunnelParams = Readonly<{
  /** The ring's radius beyond the house's bounding circle (m). */
  ringMarginM: number;
  /** Dome curve exponent (1 = cone, 2 = bowl). */
  curve: number;
  /** Height above the surface over which the cut dithers in (m). */
  softEdgeM: number;
  /** Safety factor on the ring distance the camera's elevation needs. */
  reach: number;
  /** The apex sits this far above the room's floor, so the floor and carpets are never cut (m). */
  floorClearanceM: number;
  /** The ring sits this far above the highest wall (m). */
  roofMarginM: number;
}>;

/** Implementation conventions (Phase 8.2a); the owner tunes them while comparing A and B. */
export const defaultFunnelParams: FunnelParams = {
  ringMarginM: 1,
  curve: 2,
  softEdgeM: 0.3,
  reach: 1.25,
  floorClearanceM: 0.05,
  roofMarginM: 0.3,
};

export type Funnel = Readonly<{
  apex: WorldPoint;
  ringCenterX: number;
  ringCenterZ: number;
  ringRadius: number;
  topY: number;
  curve: number;
  softEdge: number;
}>;

export type FunnelInput = Readonly<{
  /** The focused room's floor centre (y = its floor). */
  roomFloorCenter: WorldPoint;
  /** The house's bounding circle on the ground. */
  houseCenterX: number;
  houseCenterZ: number;
  houseRadius: number;
  /** The highest wall top (m). */
  wallTopY: number;
  /** The camera position. */
  eye: WorldPoint;
}>;

/** Distance from (ax, az) along the unit direction (ux, uz) to the circle; 0 when the point is outside it. */
export const ringDistance = (
  ax: number,
  az: number,
  ux: number,
  uz: number,
  cx: number,
  cz: number,
  radius: number,
): number => {
  const wx = ax - cx;
  const wz = az - cz;
  const b = wx * ux + wz * uz;
  const c = wx * wx + wz * wz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return 0;
  return Math.max(-b + Math.sqrt(discriminant), 0);
};

export const funnelFor = (input: FunnelInput, params: FunnelParams = defaultFunnelParams): Funnel => {
  const apex = { ...input.roomFloorCenter, y: input.roomFloorCenter.y + params.floorClearanceM };
  const topY = input.wallTopY + params.roofMarginM;
  const ringRadius = input.houseRadius + params.ringMarginM;
  let cx = input.houseCenterX;
  let cz = input.houseCenterZ;
  const dx = input.eye.x - apex.x;
  const dz = input.eye.z - apex.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal > 1e-6) {
    const ux = dx / horizontal;
    const uz = dz / horizontal;
    const slope = Math.max((input.eye.y - apex.y) / horizontal, 0.05);
    const needed = ((topY - apex.y) / slope) * params.reach;
    const have = ringDistance(apex.x, apex.z, ux, uz, cx, cz, ringRadius);
    if (have < needed) {
      cx += ux * (needed - have);
      cz += uz * (needed - have);
    }
  }
  return {
    apex,
    ringCenterX: cx,
    ringCenterZ: cz,
    ringRadius,
    topY,
    curve: params.curve,
    softEdge: params.softEdgeM,
  };
};

/** The funnel surface height above a ground point, or null outside the ring (nothing cut there). */
export const funnelHeight = (funnel: Funnel, x: number, z: number): number | null => {
  const dx = x - funnel.apex.x;
  const dz = z - funnel.apex.z;
  const r = Math.hypot(dx, dz);
  const ux = r > 1e-6 ? dx / r : 1;
  const uz = r > 1e-6 ? dz / r : 0;
  const s = ringDistance(
    funnel.apex.x,
    funnel.apex.z,
    ux,
    uz,
    funnel.ringCenterX,
    funnel.ringCenterZ,
    funnel.ringRadius,
  );
  if (r >= s) return null;
  return funnel.apex.y + (funnel.topY - funnel.apex.y) * Math.pow(r / Math.max(s, 1e-3), funnel.curve);
};

/**
 * How much of a point is cut: 0 kept, 1 fully cut, in between dithered (the soft edge). Picking treats a point
 * more than half cut as cut away (it looks through it).
 */
export const cutAmount = (funnel: Funnel, point: WorldPoint): number => {
  const height = funnelHeight(funnel, point.x, point.z);
  if (height === null) return 0;
  const over = point.y - height;
  if (over <= 0) return 0;
  return funnel.softEdge <= 0 ? 1 : Math.min(over / funnel.softEdge, 1);
};

/**
 * GLSL of the same test (uniforms set from a Funnel). `hpCutKeep` exempts the focused room's own contents
 * (objects, fixtures) inside its plan box; walls are always cut. Returns true when the fragment is discarded.
 */
export const funnelGlsl = /* glsl */ `
uniform float hpCutOn;
uniform vec3 hpCutApex;
uniform vec3 hpCutRing; // x, z centre and radius
uniform vec3 hpCutShape; // top y, curve, soft edge
uniform vec4 hpCutKeep; // min x, min z, max x, max z of the room (contents only)
varying vec3 hpCutWorld;
bool hpCutAway(bool isContent) {
  if (hpCutOn < 0.5) return false;
  vec3 p = hpCutWorld;
  if (isContent && p.x >= hpCutKeep.x && p.x <= hpCutKeep.z && p.z >= hpCutKeep.y && p.z <= hpCutKeep.w)
    return false;
  vec2 d = p.xz - hpCutApex.xz;
  float r = length(d);
  vec2 u = r > 1e-6 ? d / r : vec2(1.0, 0.0);
  vec2 w = hpCutApex.xz - hpCutRing.xy;
  float b = dot(w, u);
  float c = dot(w, w) - hpCutRing.z * hpCutRing.z;
  float disc = b * b - c;
  if (disc < 0.0) return false;
  float s = max(-b + sqrt(disc), 0.0);
  if (r >= s) return false;
  float h = hpCutApex.y + (hpCutShape.x - hpCutApex.y) * pow(r / max(s, 1e-3), hpCutShape.y);
  float over = p.y - h;
  if (over <= 0.0) return false;
  if (hpCutShape.z <= 0.0 || over >= hpCutShape.z) return true;
  // Soft edge: an ordered 4x4 dither of the cut amount (stable on screen, no transparency sorting).
  ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));
  int index = cell.x + cell.y * 4;
  float threshold = float((index * 7) % 16) / 16.0 + 1.0 / 32.0;
  return over / hpCutShape.z > threshold;
}
`;
