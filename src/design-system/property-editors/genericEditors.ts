// The generic editor registry from the design system. Feature code merges domain editors into it.
import { AnglePropEditor } from "./AnglePropEditor/AnglePropEditor";
import { ColorPropEditor } from "./ColorPropEditor/ColorPropEditor";
import { DateTimePropEditor } from "./DateTimePropEditor/DateTimePropEditor";
import type { PropertyEditorRegistry } from "./editorContract";
import { FilePropEditor } from "./FilePropEditor/FilePropEditor";
import { LengthPropEditor } from "./LengthPropEditor/LengthPropEditor";
import { MultiSelectPropEditor } from "./MultiSelectPropEditor/MultiSelectPropEditor";
import { NumberPropEditor } from "./NumberPropEditor/NumberPropEditor";
import { ReadOnlyPropEditor } from "./ReadOnlyPropEditor/ReadOnlyPropEditor";
import { SegmentedPropEditor } from "./SegmentedPropEditor/SegmentedPropEditor";
import { SelectPropEditor } from "./SelectPropEditor/SelectPropEditor";
import { SliderPropEditor } from "./SliderPropEditor/SliderPropEditor";
import { TextPropEditor } from "./TextPropEditor/TextPropEditor";
import { TogglePropEditor } from "./TogglePropEditor/TogglePropEditor";
import { Vector2LengthPropEditor } from "./Vector2LengthPropEditor/Vector2LengthPropEditor";

export const genericEditors: PropertyEditorRegistry = {
  text: TextPropEditor,
  number: NumberPropEditor,
  length: LengthPropEditor,
  angle: AnglePropEditor,
  select: SelectPropEditor,
  segmented: SegmentedPropEditor,
  multiSelect: MultiSelectPropEditor,
  toggle: TogglePropEditor,
  slider: SliderPropEditor,
  color: ColorPropEditor,
  vector2Length: Vector2LengthPropEditor,
  dateTime: DateTimePropEditor,
  file: FilePropEditor,
  readOnly: ReadOnlyPropEditor,
};
