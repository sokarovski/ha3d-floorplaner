import { useState } from "react";
import type { ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import type { TemplateListItemValue } from "@shared/contracts/templates";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Button } from "../../../design-system/components/Button/Button";
import { Icon } from "../../../design-system/components/Icon/Icon";
import { Input } from "../../../design-system/components/Input/Input";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { pickerCategories, searchTemplates, templateCategory } from "./pickerFilter";
import type { PickerSource } from "./pickerFilter";
import { TemplatePickerTile } from "./TemplatePickerTile";

type TemplatePickerPopupProps = Readonly<{
  open: boolean;
  title: string;
  templates: readonly TemplateListItemValue[];
  onPick: (template: TemplateListItemValue) => Promise<void>;
  onClose: () => void;
}>;

export const TemplatePickerPopup = ({
  open,
  title,
  templates,
  onPick,
  onClose,
}: TemplatePickerPopupProps): ReactElement => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<PickerSource>("all");
  const [category, setCategory] = useState<string | null>(null);
  // Categories come from the listed templates (Phase 9.1); each count follows the search and source filter.
  const categories = pickerCategories(templates);
  const matching = searchTemplates(templates, query, source);
  const counts = new Map(pickerCategories(matching).map((entry) => [entry.category, entry.count]));
  const filtered = searchTemplates(templates, query, source, category);
  // With All and several categories the grid is grouped by category, in the chips' order.
  const grouped = category === null && categories.length > 1;
  const groups = grouped
    ? categories
        .map((entry) => ({
          category: entry.category,
          items: filtered.filter((item) => templateCategory(item) === entry.category),
        }))
        .filter((group) => group.items.length > 0)
    : [{ category: category ?? "", items: filtered }];
  const shown = groups.flatMap((group) => group.items);
  const hasHouse = templates.some((template) => template.source === "house");
  const reset = (): void => {
    setQuery("");
    setSource("all");
    setCategory(null);
  };
  const close = (): void => {
    reset();
    onClose();
  };
  const pick = (template: TemplateListItemValue): void => {
    setBusy(true);
    setError(undefined);
    onPick(template).then(
      () => {
        setBusy(false);
        reset();
      },
      (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : "The object could not be placed.");
      },
    );
  };
  return (
    <Popup
      open={open}
      title={title}
      size="xl"
      busy={busy}
      onClose={close}
      footer={
        <Button variant="secondary" onPress={close} disabled={busy}>
          Cancel
        </Button>
      }
    >
      <div data-template-picker-bar="">
        <Input
          type="search"
          value={query}
          onChange={setQuery}
          autoFocus
          placeholder="Search objects"
          aria-label="Search objects"
          start={<Icon name="search" />}
          onKeyDown={(event) => {
            const first = shown[0];
            if (event.key === "Enter" && first !== undefined && !busy) {
              event.preventDefault();
              pick(first);
            }
          }}
        />
        {hasHouse ? (
          <div data-template-picker-sources="" role="group" aria-label="Source">
            {(
              [
                ["all", "All"],
                ["builtin", "Built-in"],
                ["house", "This house"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={source === id ? "secondary" : "ghost"}
                onPress={() => {
                  setSource(id);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        ) : null}
        <span data-template-picker-count="">
          {shown.length === templates.length
            ? `${String(templates.length)} objects`
            : `${String(shown.length)} of ${String(templates.length)}`}
        </span>
      </div>
      {categories.length > 1 ? (
        <ToggleButtonGroup
          aria-label="Category"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[category ?? ""]}
          onSelectionChange={(keys) => {
            const [key] = [...keys];
            if (typeof key === "string") setCategory(key === "" ? null : key);
          }}
          data-template-picker-categories=""
        >
          <ToggleButton id="" data-template-picker-category="">
            All <span data-template-picker-category-count="">{matching.length}</span>
          </ToggleButton>
          {categories.map((entry) => (
            <ToggleButton key={entry.category} id={entry.category} data-template-picker-category="">
              {entry.category}{" "}
              <span data-template-picker-category-count="">{counts.get(entry.category) ?? 0}</span>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      ) : null}
      {error === undefined ? null : <Banner tone="danger">{error}</Banner>}
      {shown.length === 0 ? (
        <p data-image-picker-empty="">No matching objects.</p>
      ) : (
        groups.map((group) => (
          <section key={group.category} data-template-picker-group="">
            {grouped ? <h3 data-template-picker-group-title="">{group.category}</h3> : null}
            <div
              data-image-picker-grid=""
              data-template-picker-grid=""
              role="listbox"
              aria-label={grouped ? group.category : "Objects"}
            >
              {group.items.map((template) => (
                <TemplatePickerTile
                  key={`${template.source}:${template.id}`}
                  template={template}
                  disabled={busy}
                  onPick={pick}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </Popup>
  );
};
