import type { ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";

type QuickPicksProps = Readonly<{
  /** Accessible name of the row, e.g. "Width quick picks". */
  label: string;
  /** Suggested values with their display text (formatted by the editor in its unit). */
  picks: readonly Readonly<{ value: number; text: string }>[];
  /** The committed value; the matching pick shows as selected. */
  value: number | undefined;
  disabled: boolean;
  onPick: (value: number) => void;
}>;

/**
 * Suggested values under a number, length, or angle field (Phase 9.1, template `quickPicks`): a compact row of
 * chips, one click commits the value. Typing any other value in the field stays possible.
 */
export const QuickPicks = ({ label, picks, value, disabled, onPick }: QuickPicksProps): ReactElement => {
  const selected = picks.find((pick) => pick.value === value);
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      selectedKeys={selected === undefined ? [] : [String(selected.value)]}
      isDisabled={disabled}
      onSelectionChange={(keys) => {
        const [key] = [...keys];
        const pick = picks.find((candidate) => String(candidate.value) === key);
        if (pick !== undefined && pick.value !== value) onPick(pick.value);
      }}
      data-editor-quick-picks=""
    >
      {picks.map((pick) => (
        <ToggleButton key={pick.value} id={String(pick.value)} data-editor-quick-pick="">
          {pick.text}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
