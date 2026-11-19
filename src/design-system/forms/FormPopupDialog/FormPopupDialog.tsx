import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { Static, TSchema } from "typebox";
import type { LengthUnit } from "@shared/domain/schemas/house";
import {
  applyDefaults,
  isSchemaNode,
  pathToPointer,
  withValueAtPath,
} from "@shared/domain/schemas/schemaWalk";
import { readAnnotation } from "@shared/domain/schemas/annotations";
import { compileValidator } from "@shared/domain/validation/ajv";
import { Banner } from "../../components/Banner/Banner";
import { Popup } from "../../components/Popup/Popup";
import type { PropertyEditorRegistry } from "../../property-editors/editorContract";
import { DiscardChangesPopup } from "../DiscardChangesPopup/DiscardChangesPopup";
import { describeSubmitError, FormSubmitError } from "../formErrors";
import { validateFormDraft } from "../formValidation";
import { SchemaForm } from "../SchemaForm/SchemaForm";

type FormPopupDialogProps<S extends TSchema> = Readonly<{
  schema: S;
  values: Partial<Static<S>>;
  onSubmit: (values: Static<S>) => Promise<void>;
  onCancel: () => void;
  registry: PropertyEditorRegistry;
  projectUnit: LengthUnit;
  footer?: ReactNode;
}>;

export const FormPopupDialog = <S extends TSchema>({
  schema,
  values,
  onSubmit,
  onCancel,
  registry,
  projectUnit,
  footer,
}: FormPopupDialogProps<S>): ReactElement => {
  const [draft, setDraft] = useState<unknown>(() =>
    isSchemaNode(schema) ? applyDefaults(schema, values) : values,
  );
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const annotation = readAnnotation(schema);

  const save = (): void => {
    const errors = validateFormDraft(schema, draft);
    setFieldErrors(errors);
    setBanner(undefined);
    const validate = compileValidator(schema);
    if (Object.keys(errors).length > 0 || !validate(draft)) return;
    setBusy(true);
    onSubmit(draft).then(
      () => {
        setBusy(false);
      },
      (error: unknown) => {
        setBusy(false);
        if (error instanceof FormSubmitError) {
          setFieldErrors(error.fieldErrors);
          if (Object.keys(error.fieldErrors).length === 0) setBanner(error.message);
        } else {
          setBanner(describeSubmitError(error));
        }
      },
    );
  };

  const requestClose = (): void => {
    if (busy) return;
    if (dirty) setConfirmingDiscard(true);
    else onCancel();
  };

  return (
    <>
      <Popup
        open
        title={annotation.title ?? "Edit"}
        size={annotation.size ?? "md"}
        onClose={requestClose}
        onSave={save}
        saveLabel={annotation.submitLabel ?? "Save"}
        cancelLabel={annotation.cancelLabel ?? "Cancel"}
        busy={busy}
        footer={footer}
      >
        {annotation.description === undefined ? null : (
          <p data-form-popup-description="">{annotation.description}</p>
        )}
        <SchemaForm
          schema={schema}
          value={draft}
          registry={registry}
          projectUnit={projectUnit}
          mode="buffered"
          errors={fieldErrors}
          disabled={busy}
          onCommit={(path, value) => {
            setDraft((current: unknown) => withValueAtPath(current, path, value));
            setDirty(true);
            const pointer = pathToPointer(path);
            setFieldErrors((current) =>
              Object.fromEntries(Object.entries(current).filter(([key]) => key !== pointer)),
            );
            return true;
          }}
        />
        {banner === undefined ? null : (
          <div data-form-popup-banner="">
            <Banner tone="danger">{banner}</Banner>
          </div>
        )}
      </Popup>
      <DiscardChangesPopup
        open={confirmingDiscard}
        onKeepEditing={() => {
          setConfirmingDiscard(false);
        }}
        onDiscard={() => {
          setConfirmingDiscard(false);
          onCancel();
        }}
      />
    </>
  );
};
