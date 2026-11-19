import type { ReactElement } from "react";
import { NavLink } from "react-router";
import type { DsNavSection } from "../catalog/navigation";

type DsSidebarProps = Readonly<{
  sections: readonly DsNavSection[];
}>;

export const DsSidebar = ({ sections }: DsSidebarProps): ReactElement => (
  <nav data-ds-sidebar="" aria-label="Design system">
    <div data-ds-sidebar-title="">Homeplan design system</div>
    {sections.map((section) => (
      <div key={section.title} data-ds-sidebar-section="">
        <div data-ds-sidebar-heading="">{section.title}</div>
        <ul>
          {section.links.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} end data-ds-sidebar-link="">
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </nav>
);
