import type { ReactElement, ReactNode } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import type { IconName } from "../../../src/design-system/components/Icon/icons";

type FeatureCardProps = Readonly<{
  icon: IconName;
  title: string;
  children: ReactNode;
}>;

export const FeatureCard = ({ icon, title, children }: FeatureCardProps): ReactElement => (
  <article data-site-card="">
    <span data-site-card-icon="">
      <Icon name={icon} size="lg" />
    </span>
    <h3>{title}</h3>
    {children}
  </article>
);
