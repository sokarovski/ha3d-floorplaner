import type { ReactElement } from "react";
import { PropertyGroup } from "../../../design-system/forms/PropertyGroup/PropertyGroup";

export const PropertyGroupExample = (): ReactElement => (
  <div data-ds-example-column="">
    <PropertyGroup title="Size" groupId="size">
      <p>Fields of the Geometry group.</p>
    </PropertyGroup>
    <PropertyGroup title="Appearance" defaultExpanded={false}>
      <p>Collapsed by default.</p>
    </PropertyGroup>
  </div>
);
