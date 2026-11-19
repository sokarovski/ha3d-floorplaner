import type { ReactElement } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import type { Capability } from "../content/possibilities";

type CapabilityListProps = Readonly<{
  label: string;
  items: readonly Capability[];
}>;

// A scannable list of capabilities: one small icon-led card per item.
export const CapabilityList = ({ label, items }: CapabilityListProps): ReactElement => (
  <ul aria-label={label} data-site-capabilities="">
    {items.map((item) => (
      <li key={item.title} data-site-capability="">
        <span data-site-capability-icon="">
          <Icon name={item.icon} />
        </span>
        <div data-site-capability-text="">
          <h4>{item.title}</h4>
          <p>{item.text}</p>
        </div>
      </li>
    ))}
  </ul>
);
