// The location editor's form: latitude, longitude, and the IANA time zone (owner, 2026-11-17: no bundled city
// list; new houses start in London and anyone else looks up their coordinates and pastes them).
import Type from "typebox";
import { hp } from "@shared/domain/schemas/annotations";

/** Every IANA time zone the browser knows, plus the location's own if the browser lacks it. */
const timeZones = (current: string): readonly string[] => {
  const known = Intl.supportedValuesOf("timeZone");
  return known.includes(current) ? known : [current, ...known];
};

export const locationFormSchema = (currentTimeZone: string): object =>
  Type.Object({
    latitudeDeg: Type.Number({
      title: "Latitude",
      minimum: -90,
      maximum: 90,
      ...hp({ editor: "number", unitSuffix: "°", order: 1 }),
    }),
    longitudeDeg: Type.Number({
      title: "Longitude",
      minimum: -180,
      maximum: 180,
      ...hp({ editor: "number", unitSuffix: "°", order: 2 }),
    }),
    timeZone: Type.Unsafe<string>({
      title: "Time zone",
      anyOf: timeZones(currentTimeZone).map((zone) => ({ const: zone, title: zone })),
      ...hp({ editor: "select", searchable: true, order: 3 }),
    }),
  });
