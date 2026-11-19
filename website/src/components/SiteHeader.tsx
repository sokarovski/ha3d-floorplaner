import type { ReactElement } from "react";
import logoUrl from "../../../brand/ha3d-logo.svg";
import { links } from "../content/links";
import { pages } from "../content/pages";
import type { PageName } from "../content/pages";

type SiteHeaderProps = Readonly<{
  page?: PageName;
}>;

export const SiteHeader = ({ page = "home" }: SiteHeaderProps): ReactElement => {
  const home = page === "home" ? "" : pages.home;
  return (
    <header data-site-header="">
      <a href="#main" data-site-skip-link="">
        Skip to content
      </a>
      <div data-site-header-inner="">
        <a href={page === "home" ? "#top" : pages.home} data-site-brand="">
          <img src={logoUrl} alt="" width={32} height={32} />
          <span>Homeplan</span>
        </a>
        <nav aria-label="Main" data-site-nav="">
          {page === "home" ? null : <a href={pages.home}>Overview</a>}
          <a href={`${home}#features`}>Features</a>
          <a href={pages.possibilities} aria-current={page === "possibilities" ? "page" : undefined}>
            All possibilities
          </a>
          <a href={`${home}#how-it-works`}>How it works</a>
          <a href={`${home}#install`}>Get started</a>
          <a href={links.appRepository}>GitHub</a>
        </nav>
      </div>
    </header>
  );
};
