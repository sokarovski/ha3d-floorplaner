import type { ReactElement } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import type { Capability } from "../content/possibilities";
import { screenshots, screenshotUrl } from "../content/screenshots";

type CapabilityListProps = Readonly<{
  label: string;
  items: readonly Capability[];
}>;

// A scannable list of capabilities: one small card per item, led by an icon or by its own picture.
export const CapabilityList = ({ label, items }: CapabilityListProps): ReactElement => (
  <ul aria-label={label} data-site-capabilities="">
    {items.map((item) => (
      <li
        key={item.title}
        data-site-capability=""
        data-site-capability-pictured={item.image === undefined ? undefined : ""}
      >
        {item.image === undefined ? (
          <span data-site-capability-icon="">
            <Icon name={item.icon} />
          </span>
        ) : (
          <img
            src={screenshotUrl(screenshots[item.image].file)}
            alt={screenshots[item.image].alt}
            width={screenshots[item.image].width}
            height={screenshots[item.image].height}
            loading="lazy"
            decoding="async"
            data-site-capability-image=""
          />
        )}
        <div data-site-capability-text="">
          <h4>{item.title}</h4>
          <p>{item.text}</p>
        </div>
      </li>
    ))}
  </ul>
);
