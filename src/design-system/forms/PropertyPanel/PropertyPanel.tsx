import type { ReactElement, ReactNode } from "react";
import type { LengthUnit } from "@shared/domain/schemas/house";
import { Panel } from "../../components/Panel/Panel";
import type { CommitResult, PropertyEditorRegistry } from "../../property-editors/editorContract";
import { SchemaForm } from "../SchemaForm/SchemaForm";

type PropertyPanelProps = Readonly<{
  title: string;
  subtitle?: string;
  schema: object | undefined;
  value: unknown;
  registry: PropertyEditorRegistry;
  projectUnit: LengthUnit;
  onCommit: (path: readonly string[], value: unknown) => CommitResult;
  onPreview?: (path: readonly string[], value: unknown) => void;
  mixedPointers?: ReadonlySet<string>;
  errors?: Readonly<Record<string, string>>;
  emptyMessage?: string;
  headerActions?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
}>;

export const PropertyPanel = ({
  title,
  subtitle,
  schema,
  value,
  registry,
  projectUnit,
  onCommit,
  onPreview,
  mixedPointers,
  errors,
  emptyMessage = "Select something to see its properties.",
  headerActions,
  before,
  after,
}: PropertyPanelProps): ReactElement => (
  // The header names the selected object, after a properties icon (owner, Phase 5 follow-up).
  <Panel title={title} icon="properties" actions={headerActions}>
    <div data-property-panel="">
      {subtitle === undefined ? null : <div data-property-panel-subtitle="">{subtitle}</div>}
      {before}
      {schema === undefined ? (
        <p data-property-panel-empty="">{emptyMessage}</p>
      ) : (
        <SchemaForm
          schema={schema}
          value={value}
          registry={registry}
          projectUnit={projectUnit}
          mode="live"
          onCommit={onCommit}
          onPreview={onPreview}
          mixedPointers={mixedPointers}
          errors={errors}
        />
      )}
      {after}
    </div>
  </Panel>
);
