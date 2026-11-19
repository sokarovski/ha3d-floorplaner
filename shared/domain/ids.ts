// Stable ID generation: "<prefix>_<10 lowercase alphanumerics>" (spec/architecture/api.md#conventions).

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

export type IdPrefix =
  | "h" // house
  | "f" // building floor
  | "a" // area
  | "fs" // floor surface (floor-shape group)
  | "s" // source shape
  | "v" // polygon vertex
  | "w" // wall
  | "wr" // wall relief (box or niche, Phase 5.0)
  | "o" // template instance (opening or object)
  | "fx" // ambient effect on an object (D24)
  | "st" // staircase instance (before Phase 16.14; migrated stairs keep their ID)
  | "c" // carpet
  | "l" // light
  | "g" // light group
  | "og" // object group
  | "gd" // guide
  | "rc" // roof cut (before schema version 6, Phase 19.2: converted into roofs)
  | "rf" // roof (Phase 19.1)
  | "rp" // roof point
  | "rl" // roof break line
  | "rh" // roof hole (Phase 19.3)
  | "rw" // roof window (Phase 19.3)
  | "mp" // material preset
  | "img" // image
  | "t" // house template
  | "hb" // Home Assistant bubble (preferences, Phase 8.5)
  | "x" // export
  | "job"; // render job

export const createId = (prefix: IdPrefix): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) suffix += alphabet.charAt(byte % alphabet.length);
  return `${prefix}_${suffix}`;
};

export const isId = (value: string): boolean => /^[a-z]+_[a-z0-9]{6,}$/.test(value);
