import { useState } from "react";
import type { ReactElement } from "react";
import { withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { Button } from "../../../design-system/components/Button/Button";
import { PropertyPanel } from "../../../design-system/forms/PropertyPanel/PropertyPanel";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { panelFixtures } from "../catalog/panelFixtures";
import { describeCommit } from "../services/commitLog";

export const PropertyPanelPlaygroundExample = (): ReactElement => {
  const [fixtureId, setFixtureId] = useState<string>("wall");
  const [values, setValues] = useState<Readonly<Record<string, unknown>>>(() =>
    Object.fromEntries(panelFixtures.map((fixture) => [fixture.id, fixture.value])),
  );
  const [commands, setCommands] = useState<readonly string[]>([]);
  // Multi-selection (Phase 5.7 done-when, added in 7.6): two of this kind, differing in their first two fields.
  const [mixed, setMixed] = useState(false);
  const fixture = panelFixtures.find((candidate) => candidate.id === fixtureId) ?? panelFixtures[0];
  const value = values[fixture.id];
  const mixedKeys =
    typeof value === "object" && value !== null
      ? Object.keys(value)
          .slice(0, 2)
          .map((key) => `/${key}`)
      : [];
  return (
    <div data-ds-example-column="" data-ds-wide="">
      <div data-ds-button-row="">
        {panelFixtures.map((candidate) => (
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
        <Button
          variant={mixed ? "primary" : "ghost"}
          size="sm"
          onPress={() => {
            setMixed(!mixed);
          }}
        >
          Two selected (mixed)
        </Button>
      </div>
      <div data-ds-two-column="">
        <div data-ds-panel-frame="">
          <PropertyPanel
            title={mixed ? `2 × ${fixture.label}` : "Properties"}
            subtitle={mixed ? undefined : fixture.label}
            mixedPointers={mixed ? new Set(["", ...mixedKeys]) : undefined}
            schema={fixture.schema}
            value={value}
            registry={genericEditors}
            projectUnit="mm"
            onCommit={(path, next) => {
              setValues((current) => ({
                ...current,
                [fixture.id]: withValueAtPath(current[fixture.id], path, next),
              }));
              setCommands((current) =>
                [
                  `setProperty(${fixture.id}, ${JSON.stringify(path)}, ${describeCommit(next)})`,
                  ...current,
                ].slice(0, 10),
              );
              return true;
            }}
            onPreview={(path, next) => {
              setCommands((current) =>
                [`preview(${JSON.stringify(path)}, ${describeCommit(next)})`, ...current].slice(0, 10),
              );
            }}
          />
        </div>
        <div>
          <pre data-ds-json="">{JSON.stringify(value, null, 2)}</pre>
          <div data-ds-commit-log="">
            <strong>Commands</strong>
            <ul>
              {commands.map((line, index) => (
                <li key={`${String(index)}-${line}`}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
