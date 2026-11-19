import type { ReactElement } from "react";
import { HouseLocation } from "@shared/domain/schemas/house";
import { compileValidator } from "@shared/domain/validation/ajv";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { locationFormSchema } from "./locationSchemas";

export const LocationPropEditor = ({
  id,
  value,
  projectUnit,
  disabled,
  onCommit,
}: PropertyEditorProps): ReactElement | null => {
  const isLocation = compileValidator(HouseLocation);
  const location = isLocation(value) ? value : undefined;
  if (location === undefined) return null;
  const { latitudeDeg, longitudeDeg, timeZone } = location;
  return (
    <div data-location-editor="" id={id}>
      <SchemaForm
        schema={locationFormSchema(timeZone)}
        value={{ latitudeDeg, longitudeDeg, timeZone }}
        registry={genericEditors}
        projectUnit={projectUnit}
        mode="live"
        disabled={disabled}
        onCommit={(path, next) => {
          const key = path[0];
          // Saved without the old country and city labels (they no longer describe the coordinates).
          return key === undefined ? false : onCommit({ latitudeDeg, longitudeDeg, timeZone, [key]: next });
        }}
      />
      <p data-location-hint="">
        New houses start in London. For your own place, look up its coordinates on a map (search “&lt;your
        town&gt; coordinates”) and paste the latitude and longitude here.
      </p>
    </div>
  );
};
