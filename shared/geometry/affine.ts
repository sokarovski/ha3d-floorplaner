// 2D affine transforms: x' = a·x + c·y + tx, y' = b·x + d·y + ty.
import type { Vec2 } from "./vector";

export type Affine2 = Readonly<{ a: number; b: number; c: number; d: number; tx: number; ty: number }>;

export const identityAffine: Affine2 = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export const degToRad = (degrees: number): number => (degrees * Math.PI) / 180;

/** Placement of a child frame in its parent: rotate counterclockwise by rotationDeg about the child origin, then translate by positionMm. */
export const placementAffine = (positionMm: Vec2, rotationDeg: number): Affine2 => {
  const radians = degToRad(rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, tx: positionMm.x, ty: positionMm.y };
};

/** outer ∘ inner: applies inner first, then outer. */
export const composeAffine = (outer: Affine2, inner: Affine2): Affine2 => ({
  a: outer.a * inner.a + outer.c * inner.b,
  b: outer.b * inner.a + outer.d * inner.b,
  c: outer.a * inner.c + outer.c * inner.d,
  d: outer.b * inner.c + outer.d * inner.d,
  tx: outer.a * inner.tx + outer.c * inner.ty + outer.tx,
  ty: outer.b * inner.tx + outer.d * inner.ty + outer.ty,
});

export const applyAffine = (m: Affine2, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y + m.tx,
  y: m.b * p.x + m.d * p.y + m.ty,
});

/** Applies only the linear part (for directions and normals of rigid transforms). */
export const applyLinear = (m: Affine2, v: Vec2): Vec2 => ({
  x: m.a * v.x + m.c * v.y,
  y: m.b * v.x + m.d * v.y,
});

export const invertAffine = (m: Affine2): Affine2 => {
  const determinant = m.a * m.d - m.b * m.c;
  if (determinant === 0) throw new Error("Affine transform is not invertible");
  const a = m.d / determinant;
  const b = -m.b / determinant;
  const c = -m.c / determinant;
  const d = m.a / determinant;
  return { a, b, c, d, tx: -(a * m.tx + c * m.ty), ty: -(b * m.tx + d * m.ty) };
};

/** True when the transform keeps orientation (positive determinant). */
export const preservesOrientation = (m: Affine2): boolean => m.a * m.d - m.b * m.c > 0;
