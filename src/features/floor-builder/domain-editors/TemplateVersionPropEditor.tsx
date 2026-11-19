import type { ReactElement } from "react";
import { TemplateRef } from "@shared/domain/schemas/values";
import { compileValidator } from "@shared/domain/validation/ajv";
import { Button } from "../../../design-system/components/Button/Button";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { pickerStore } from "../templates/templatePickerStore";
import { useDomainEditorData } from "./domainEditorData";
import { ownerId, ownerTemplateId } from "./ownerFields";

export const TemplateVersionPropEditor = ({
  id,
  value,
  owner,
  mixed,
  disabled,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const data = useDomainEditorData();
  const isRef = compileValidator(TemplateRef);
  const fixtureMode = value === null || isRef(value);
  const templateId = isRef(value) ? value.templateId : ownerTemplateId(owner);
  const version = isRef(value) ? value.templateVersion : typeof value === "number" ? value : undefined;
  const item = data.templates.find((candidate) => candidate.id === templateId);
  const latest = item === undefined ? undefined : Math.max(...item.versions);
  const lightId = ownerId(owner);
  return (
    <div data-template-version-editor="" id={id}>
      <span data-template-version-label="">
        {mixed
          ? "Mixed"
          : templateId === undefined
            ? "None (invisible source)"
            : `${item?.label ?? templateId} · v${String(version ?? "?")}`}
      </span>
      {!mixed && latest !== undefined && version !== undefined && latest > version ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onPress={() => {
            data.updateTemplateVersion(owner, latest);
          }}
        >
          Update to v{latest}
        </Button>
      ) : null}
      {fixtureMode && lightId !== undefined ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onPress={() => {
              pickerStore.setState({ request: { kind: "fixture", lightId } });
            }}
          >
            {templateId === undefined ? "Choose fixture…" : "Change…"}
          </Button>
          {templateId === undefined ? null : (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onPress={() => {
                onCommit(null);
              }}
            >
              Remove
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
};
