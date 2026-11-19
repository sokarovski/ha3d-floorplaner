import { useState } from "react";
import type { ReactElement } from "react";
import { withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { PropertyPanel } from "../../../design-system/forms/PropertyPanel/PropertyPanel";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { fixtureCabinet, fixtureCabinetSchema } from "../catalog/templateSettingsFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { describeCommit } from "../services/commitLog";

export const TemplateSettingsPanelExample = (): ReactElement => {
  const [value, setValue] = useState<unknown>(fixtureCabinet);
  const [commands, setCommands] = useState<readonly string[]>([]);
  return (
    <DomainFixture>
      <div data-ds-example-column="" data-ds-wide="">
        <div data-ds-two-column="">
          <div data-ds-panel-frame="">
            <PropertyPanel
              title="Wall cabinet 1"
              schema={fixtureCabinetSchema}
              value={value}
              registry={applicationRegistry()}
              projectUnit="mm"
              onCommit={(path, next) => {
                setValue((current: unknown) => withValueAtPath(current, path, next));
                setCommands((current) =>
                  [`setProperty(${JSON.stringify(path)}, ${describeCommit(next)})`, ...current].slice(0, 10),
                );
                return true;
              }}
            />
          </div>
          <div>
            <pre data-ds-json="">
              {JSON.stringify(
                typeof value === "object" && value !== null && "parameters" in value
                  ? {
                      parameters: value.parameters,
                      materialOverrides: "materialOverrides" in value ? value.materialOverrides : {},
                    }
                  : value,
                null,
                2,
              )}
            </pre>
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
    </DomainFixture>
  );
};
