import type { ReactElement } from "react";
import {
  Button as AriaButton,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Separator,
  Tooltip as AriaTooltip,
  TooltipTrigger,
} from "react-aria-components";
import type { Key, Selection } from "react-aria-components";
import { Icon } from "../Icon/Icon";
import type { IconSelectAction, IconSelectOption } from "./iconSelectMenuItem";

type IconSelectMenuProps = Readonly<{
  label: string;
  options: readonly IconSelectOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  actions?: readonly IconSelectAction[];
  onAction?: (id: string) => void;
  tooltip?: string;
  active?: boolean;
  placement?: "bottom start" | "bottom end" | "right top";
}>;

export const IconSelectMenu = ({
  label,
  options,
  selectedId,
  onSelect,
  actions = [],
  onAction,
  tooltip,
  active = false,
  placement = "bottom end",
}: IconSelectMenuProps): ReactElement => {
  const selected = options.find((option) => option.id === selectedId) ?? options[0];
  const trigger = (
    <AriaButton
      aria-label={selected === undefined ? label : `${label}: ${selected.label}`}
      data-icon-select-menu=""
      data-icon-select-menu-active={active ? "" : undefined}
    >
      {selected === undefined ? null : <Icon name={selected.icon} />}
      <span data-icon-select-menu-chevron="">
        <Icon name="chevronDown" size="sm" />
      </span>
    </AriaButton>
  );
  return (
    <MenuTrigger>
      {tooltip === undefined ? (
        trigger
      ) : (
        <TooltipTrigger delay={500} closeDelay={0}>
          {trigger}
          <AriaTooltip placement="bottom" offset={8} data-tooltip="">
            {tooltip}
          </AriaTooltip>
        </TooltipTrigger>
      )}
      <Popover placement={placement} data-menu-popover="">
        <AriaMenu
          aria-label={label}
          data-menu=""
          onAction={(key: Key) => {
            const id = String(key);
            if (actions.some((action) => action.id === id)) onAction?.(id);
          }}
        >
          <MenuSection
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[selectedId]}
            onSelectionChange={(keys: Selection) => {
              if (keys === "all") return;
              const [first] = [...keys];
              if (first !== undefined) onSelect(String(first));
            }}
          >
            {options.map((option) => (
              <AriaMenuItem key={option.id} id={option.id} textValue={option.label} data-menu-item="">
                {({ isSelected }) => (
                  <>
                    <Icon name={option.icon} />
                    <span data-menu-item-label="">{option.label}</span>
                    {isSelected ? (
                      <span data-icon-select-menu-check="">
                        <Icon name="check" size="sm" />
                      </span>
                    ) : (
                      <span data-menu-item-icon-space="" />
                    )}
                  </>
                )}
              </AriaMenuItem>
            ))}
          </MenuSection>
          {actions.length === 0 ? null : <Separator data-icon-select-menu-separator="" />}
          {actions.length === 0 ? null : (
            <MenuSection>
              {actions.map((action) => (
                <AriaMenuItem key={action.id} id={action.id} textValue={action.label} data-menu-item="">
                  <Icon name={action.icon} />
                  <span data-menu-item-label="">{action.label}</span>
                  <span data-menu-item-icon-space="" />
                </AriaMenuItem>
              ))}
            </MenuSection>
          )}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
};
