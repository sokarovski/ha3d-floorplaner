import type { ReactElement } from "react";
import Type from "typebox";
import { setGroupLightsCommand } from "@shared/domain/commands/furnishingCommands";
import { Light } from "@shared/domain/schemas/light";
import type { LightGroupValue, LightValue } from "@shared/domain/schemas/light";
import { PropertyGroup } from "../../../design-system/forms/PropertyGroup/PropertyGroup";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import { useHouse, useSession } from "../hooks/sessionContext";
import { applicationRegistry } from "../services/editorRegistry";
import { mixedPointers } from "../services/mixedValues";

type LightGroupSectionProps = Readonly<{
  floorId: string;
  group: LightGroupValue;
}>;

const bulkSchema = Type.Object({
  enabled: Light.properties.defaults.properties.enabled,
  brightness: Light.properties.defaults.properties.brightness,
  color: Light.properties.defaults.properties.color,
});

export const LightGroupSection = ({ floorId, group }: LightGroupSectionProps): ReactElement => {
  const session = useSession();
  const units = useHouse((house) => house.units);
  const members = useHouse(
    (house) =>
      house.floors
        .find((floor) => floor.id === floorId)
        ?.areas.flatMap((area) => area.lights)
        .filter((light) => group.memberIds.includes(light.id)) ?? [],
  );
  const values = members.map((light: LightValue) => ({
    enabled: light.defaults.enabled,
    brightness: light.defaults.brightness,
    color: light.defaults.color,
  }));
  const first = values[0];
  return (
    <PropertyGroup title={`Set on ${String(members.length)} member${members.length === 1 ? "" : "s"}`}>
      {first === undefined ? (
        <p data-library-empty="">Add lights to the group to edit them together.</p>
      ) : (
        <SchemaForm
          schema={bulkSchema}
          value={first}
          registry={applicationRegistry()}
          projectUnit={units}
          mode="live"
          mixedPointers={mixedPointers(values)}
          onCommit={(path, next) => {
            const key = path[0];
            if (key === "enabled" && typeof next === "boolean")
              return session.execute(setGroupLightsCommand(floorId, group.id, { enabled: next })).ok;
            if (key === "brightness" && typeof next === "number")
              return session.execute(setGroupLightsCommand(floorId, group.id, { brightness: next })).ok;
            if (key === "color") {
              const color = { ...first.color, ...(path[1] === undefined ? {} : { [path[1]]: next }) };
              return session.execute(setGroupLightsCommand(floorId, group.id, { color })).ok;
            }
            return false;
          }}
        />
      )}
    </PropertyGroup>
  );
};
