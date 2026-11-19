import type { ReactElement, ReactNode } from "react";
import type { Static, TSchema } from "typebox";
import type { LengthUnit } from "@shared/domain/schemas/house";
import type { PropertyEditorRegistry } from "../../property-editors/editorContract";
import { genericEditors } from "../../property-editors/genericEditors";
import { FormPopupDialog } from "../FormPopupDialog/FormPopupDialog";

type FormPopupProps<S extends TSchema> = Readonly<{
  open: boolean;
  schema: S;
  values: Partial<Static<S>>;
  onSubmit: (values: Static<S>) => Promise<void>;
  onCancel: () => void;
  registry?: PropertyEditorRegistry;
  projectUnit?: LengthUnit;
  footer?: ReactNode;
}>;

/** Popup + buffered SchemaForm. The draft is created when the popup opens and discarded when it closes. */
export const FormPopup = <S extends TSchema>({
  open,
  schema,
  values,
  onSubmit,
  onCancel,
  registry = genericEditors,
  projectUnit = "mm",
  footer,
}: FormPopupProps<S>): ReactElement | null =>
  open ? (
    <FormPopupDialog
      schema={schema}
      values={values}
      onSubmit={onSubmit}
      onCancel={onCancel}
      registry={registry}
      projectUnit={projectUnit}
      footer={footer}
    />
  ) : null;
