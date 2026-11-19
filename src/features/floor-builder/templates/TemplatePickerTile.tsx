import type { ReactElement } from "react";
import type { TemplateListItemValue } from "@shared/contracts/templates";

type TemplatePickerTileProps = Readonly<{
  template: TemplateListItemValue;
  disabled: boolean;
  onPick: (template: TemplateListItemValue) => void;
}>;

/** One object in the picker grid: thumbnail, label, source and version, and the product name when declared. */
export const TemplatePickerTile = ({ template, disabled, onPick }: TemplatePickerTileProps): ReactElement => {
  const product = [template.product?.manufacturer, template.product?.name]
    .filter((part) => part !== undefined)
    .join(" ");
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      data-image-picker-item=""
      disabled={disabled}
      onClick={() => {
        onPick(template);
      }}
    >
      {template.thumbnailUrl === null ? (
        <span data-template-thumb-empty="" />
      ) : (
        <img src={template.thumbnailUrl} alt="" data-image-picker-thumb="" data-template-thumb="" />
      )}
      <span data-image-picker-name="">{template.label}</span>
      {product === "" ? null : <span data-template-meta="">{product}</span>}
      <span data-template-meta="">
        {template.source === "builtin" ? "Built-in" : "House"} · v{Math.max(...template.versions)}
      </span>
    </button>
  );
};
