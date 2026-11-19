import { useState } from "react";
import type { ReactElement } from "react";
import { exportPngForm } from "@shared/domain/schemas/forms/exportForms";
import { applyDefaults, isSchemaNode, withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";

export const SchemaFormBufferedExample = (): ReactElement => {
  const [draft, setDraft] = useState<unknown>(() =>
    isSchemaNode(exportPngForm) ? applyDefaults(exportPngForm, {}) : {},
  );
  return (
    <div data-ds-two-column="">
      <SchemaForm
        schema={exportPngForm}
        value={draft}
        registry={genericEditors}
        projectUnit="mm"
        mode="buffered"
        onCommit={(path, next) => {
          setDraft((current: unknown) => withValueAtPath(current, path, next));
          return true;
        }}
      />
      <pre data-ds-json="">{JSON.stringify(draft, null, 2)}</pre>
    </div>
  );
};
