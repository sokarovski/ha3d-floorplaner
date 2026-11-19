// The screen share the house keeps clear on each side (floor widgets, room cards), 0..1 of the width/height.
// Kept apart from houseViewer.ts so pure modules (and the Node checks) can use it without the 3D viewer.
export type FrameInsets = Readonly<{ left: number; right: number; top: number; bottom: number }>;

export const noInsets: FrameInsets = { left: 0, right: 0, top: 0, bottom: 0 };
