import { useState } from "react";
import type { ReactElement } from "react";
import { Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { numericLimits } from "@shared/domain/schemas/schemaWalk";
import { formatPlainNumber, parsePlainNumber } from "@shared/domain/units/numbers";
import { Input } from "../../components/Input/Input";
import type { PropertyEditorProps } from "../editorContract";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { checkLimits } from "../limitMessages";
import { sliderRange, toDisplayed, toStored } from "../sliderRules";
import { useDraftField } from "../useDraftField";

export const SliderPropEditor = ({
  id,
  label,
  value,
  schema,
  annotation,
  mixed,
  disabled,
  describedBy,
  onPreview,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const limits = numericLimits(schema);
  const range = sliderRange(limits, annotation);
  const inverted = annotation.inverted === true;
  const stored = typeof value === "number" ? value : range.minimum;
  const [dragValue, setDragValue] = useState<number | undefined>(undefined);
  const displayed = dragValue ?? toDisplayed(stored, inverted, range);
  const field = useDraftField(
    mixed ? "" : formatPlainNumber(toDisplayed(stored, inverted, range), 3),
    (text) => {
      const parsed = parsePlainNumber(text, limits.integer);
      if (!parsed.ok) return parsed;
      const message = checkLimits(
        parsed.value,
        { ...limits, minimum: range.minimum, maximum: range.maximum },
        (amount) => formatPlainNumber(amount, 3),
      );
      return message === undefined
        ? { ok: true, value: toStored(parsed.value, inverted, range) }
        : { ok: false, message };
    },
    onCommit,
  );
  const messageId = `${id}-message`;
  return (
    <div data-editor-slider-wrap="">
      <div data-editor-slider="">
        <Slider
          aria-label={label}
          minValue={range.minimum}
          maxValue={range.maximum}
          step={range.step}
          value={displayed}
          isDisabled={disabled}
          onChange={(amount: number) => {
            setDragValue(amount);
            onPreview?.(toStored(amount, inverted, range));
          }}
          onChangeEnd={(amount: number) => {
            setDragValue(undefined);
            onCommit(toStored(amount, inverted, range));
          }}
          data-editor-slider-control=""
        >
          <SliderTrack data-editor-slider-track="">
            {({ state }) => (
              <>
                <span data-editor-slider-rail="" />
                <span
                  data-editor-slider-fill=""
                  ref={(element) => {
                    element?.style.setProperty("--slider-fill", `${String(state.getThumbPercent(0) * 100)}%`);
                  }}
                />
                <SliderThumb data-editor-slider-thumb="" />
              </>
            )}
          </SliderTrack>
        </Slider>
        <Input
          id={id}
          value={dragValue === undefined ? field.text : formatPlainNumber(dragValue, 3)}
          onChange={field.setText}
          onBlur={field.onBlur}
          onKeyDown={field.onKeyDown}
          placeholder={mixed ? "Mixed" : undefined}
          disabled={disabled}
          invalid={field.message !== undefined}
          dirty={field.editing}
          monospace
          align="end"
          suffix={annotation.unitSuffix}
          aria-label={`${label} value`}
          aria-describedby={field.message === undefined ? describedBy : messageId}
        />
      </div>
      <EditorMessage id={messageId} message={field.message} />
    </div>
  );
};
