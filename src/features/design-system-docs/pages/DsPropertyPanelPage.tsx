import type { ReactElement } from "react";
import { DsExample } from "../components/DsExample";
import { PropertyPanelPlaygroundExample } from "../examples/PropertyPanelPlaygroundExample";
import playgroundSource from "../examples/PropertyPanelPlaygroundExample.tsx?raw";
import panelSource from "../../../design-system/forms/PropertyPanel/PropertyPanel.tsx?raw";

export const DsPropertyPanelPage = (): ReactElement => (
  <article data-ds-page="">
    <h1>Property panel</h1>
    <p data-ds-lead="">
      The panel walks the selected type&apos;s schema and renders each visible property with its registered
      editor. It has no per-type code: a template&apos;s parameters appear by adding schema only.
    </p>
    <DsExample
      example={{
        id: "property-panel",
        title: "Wall, Light, and a window template",
        description:
          "Edit fields: the JSON value updates and each commit is listed as the command it would produce. Switch the light's color mode to rgb to see visibleWhen.",
        Example: PropertyPanelPlaygroundExample,
        source: playgroundSource,
        companions: [{ label: "PropertyPanel.tsx", source: panelSource }],
      }}
    />
  </article>
);
