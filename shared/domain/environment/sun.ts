// The one solar adapter (spec/builder/features/house-environment.md#solar-calculations). SunCalc 2.1 (pinned)
// returns azimuth in degrees clockwise from geographic north and apparent (refraction-corrected) altitude in
// degrees, which is already the application convention. This adapter adds the plan-frame direction using
// northRotationDeg (clockwise from plan up). SunCalc 1.x used radians from south; do not mix examples.
import { getPosition } from "suncalc";
import type { HouseEnvironmentValue } from "../schemas/house";
import { resolveLocalDateTime } from "./timeZones";

export const solarCalculationVersion = "suncalc-2.1.4 (apparent altitude)";

export type SunPosition = Readonly<{
  instant: Date;
  azimuthDeg: number;
  elevationDeg: number;
  /** Unit vector toward the sun in plan axes (x right, y up the plan, h up). */
  directionPlan: Readonly<{ x: number; y: number; h: number }>;
  phase: "day" | "twilight" | "night";
}>;

export type SunResult = Readonly<{ ok: true; sun: SunPosition }> | Readonly<{ ok: false; message: string }>;

const radians = (deg: number): number => (deg * Math.PI) / 180;

/** Unit vector toward the sun in plan axes from a compass azimuth (clockwise from north) and an elevation. */
export const sunDirectionPlan = (
  azimuthDeg: number,
  elevationDeg: number,
  northRotationDeg: number,
): Readonly<{ x: number; y: number; h: number }> => {
  const north = { x: Math.sin(radians(northRotationDeg)), y: Math.cos(radians(northRotationDeg)) };
  const east = { x: Math.cos(radians(northRotationDeg)), y: -Math.sin(radians(northRotationDeg)) };
  const horizontal = Math.cos(radians(elevationDeg));
  return {
    x: horizontal * (north.x * Math.cos(radians(azimuthDeg)) + east.x * Math.sin(radians(azimuthDeg))),
    y: horizontal * (north.y * Math.cos(radians(azimuthDeg)) + east.y * Math.sin(radians(azimuthDeg))),
    h: Math.sin(radians(elevationDeg)),
  };
};

/** Day above the horizon, twilight down to −6° (civil twilight), night below. */
export const sunPhase = (elevationDeg: number): "day" | "twilight" | "night" =>
  elevationDeg > 0 ? "day" : elevationDeg > -6 ? "twilight" : "night";

export const sunPositionAt = (
  instant: Date,
  latitudeDeg: number,
  longitudeDeg: number,
  northRotationDeg: number,
): SunPosition => {
  const position = getPosition(instant, latitudeDeg, longitudeDeg);
  const azimuthDeg = ((position.azimuth % 360) + 360) % 360;
  const elevationDeg = position.altitude;
  return {
    instant,
    azimuthDeg,
    elevationDeg,
    directionPlan: sunDirectionPlan(azimuthDeg, elevationDeg, northRotationDeg),
    phase: sunPhase(elevationDeg),
  };
};

/** The effective instant of the environment: fixed local time in the house zone, or now. */
export const effectiveInstant = (
  environment: HouseEnvironmentValue,
  now: Date,
): Readonly<{ ok: true; instant: Date }> | Readonly<{ ok: false; message: string }> => {
  if (environment.sun.timeMode === "current") return { ok: true, instant: now };
  const resolved = resolveLocalDateTime(environment.sun.fixedLocalDateTime, environment.location.timeZone);
  return resolved.ok ? { ok: true, instant: resolved.utc } : resolved;
};

export const environmentSun = (environment: HouseEnvironmentValue, now: Date): SunResult => {
  const instant = effectiveInstant(environment, now);
  if (!instant.ok) return instant;
  return {
    ok: true,
    sun: sunPositionAt(
      instant.instant,
      environment.location.latitudeDeg,
      environment.location.longitudeDeg,
      environment.northRotationDeg,
    ),
  };
};
