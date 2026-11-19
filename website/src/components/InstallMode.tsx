import type { ReactElement, ReactNode } from "react";

type InstallModeProps = Readonly<{
  id: string;
  title: string;
  summary: string;
  children: ReactNode;
}>;

export const InstallMode = ({ id, title, summary, children }: InstallModeProps): ReactElement => (
  <article aria-labelledby={id} data-site-card="" data-site-install-mode="">
    <h3 id={id}>{title}</h3>
    <p data-site-install-summary="">{summary}</p>
    {children}
  </article>
);
