import type { ReactElement } from "react";
import { Icon } from "../../../design-system/components/Icon/Icon";
import { iconPaths } from "../../../design-system/components/Icon/icons";
import { iconNames } from "../services/iconNames";

export const IconGalleryExample = (): ReactElement => (
  <>
    {iconNames(iconPaths).map((name) => (
      <span key={name} title={name}>
        <Icon name={name} size="lg" label={name} />
      </span>
    ))}
  </>
);
