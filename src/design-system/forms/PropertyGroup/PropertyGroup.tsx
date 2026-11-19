import { useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";
import { Button as AriaButton, Disclosure, DisclosurePanel, Heading } from "react-aria-components";
import { Icon } from "../../components/Icon/Icon";
import { collapsedGroups } from "./collapsedGroups";

type PropertyGroupProps = Readonly<{
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  /**
   * A catalog group ID (Phase 5.7): collapsing it is remembered for the session for every type that has the
   * group, so collapsing Placement on a sofa also collapses it on a lamp. Without an ID the group keeps its
   * own state.
   */
  groupId?: string;
}>;

export const PropertyGroup = ({
  title,
  children,
  defaultExpanded = true,
  groupId,
}: PropertyGroupProps): ReactElement => {
  const collapsed = useSyncExternalStore(collapsedGroups.subscribe, () =>
    groupId === undefined ? false : collapsedGroups.has(groupId),
  );
  return groupId === undefined ? (
    <Disclosure defaultExpanded={defaultExpanded} data-property-group="">
      <Heading data-property-group-heading="">
        <AriaButton slot="trigger" data-property-group-trigger="">
          <Icon name="chevronRight" size="sm" />
          {title}
        </AriaButton>
      </Heading>
      <DisclosurePanel data-property-group-panel="">{children}</DisclosurePanel>
    </Disclosure>
  ) : (
    <Disclosure
      isExpanded={!collapsed}
      onExpandedChange={(expanded) => {
        collapsedGroups.set(groupId, !expanded);
      }}
      data-property-group=""
    >
      <Heading data-property-group-heading="">
        <AriaButton slot="trigger" data-property-group-trigger="">
          <Icon name="chevronRight" size="sm" />
          {title}
        </AriaButton>
      </Heading>
      <DisclosurePanel data-property-group-panel="">{children}</DisclosurePanel>
    </Disclosure>
  );
};
