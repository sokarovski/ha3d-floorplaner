import { useState } from "react";
import type { ReactElement } from "react";
import { withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { Button } from "../../../design-system/components/Button/Button";
import { PropertyPanel } from "../../../design-system/forms/PropertyPanel/PropertyPanel";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { sectionFixtures } from "../catalog/panelFixtures";
import { DomainFixture } from "../components/DomainFixture";

export const StackedSectionsExample = (): ReactElement => {
  const [fixtureId, setFixtureId] = useState<string>("roof");
  const [values, setValues] = useState<Readonly<Record<string, unknown>>>(() =>
    Object.fromEntries(sectionFixtures.map((fixture) => [fixture.id, fixture.value])),
  );
  const fixture = sectionFixtures.find((candidate) => candidate.id === fixtureId) ?? sectionFixtures[0];
  return (
    <DomainFixture>
      <div data-ds-example-column="">
        <div data-ds-button-row="">
          {sectionFixtures.map((candidate) => (
            <Button
              key={candidate.id}
              variant={candidate.id === fixtureId ? "primary" : "secondary"}
              size="sm"
              onPress={() => {
                setFixtureId(candidate.id);
              }}
            >
              {candidate.label}
            </Button>
          ))}
        </div>
        <div data-ds-panel-frame="">
          <PropertyPanel
            title={fixture.label}
            schema={fixture.schema}
            value={values[fixture.id]}
            registry={applicationRegistry()}
            projectUnit="mm"
            onCommit={(path, next) => {
              setValues((current) => ({
                ...current,
                [fixture.id]: withValueAtPath(current[fixture.id], path, next),
              }));
              return true;
            }}
          />
        </div>
      </div>
    </DomainFixture>
  );
};
