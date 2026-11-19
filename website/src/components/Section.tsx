import type { ReactElement, ReactNode } from "react";

type SectionProps = Readonly<{
  id: string;
  title: string;
  lead?: ReactNode;
  tone?: "plain" | "surface";
  children: ReactNode;
}>;

export const Section = ({ id, title, lead, tone = "plain", children }: SectionProps): ReactElement => (
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    data-site-section=""
    data-site-section-surface={tone === "surface" ? "" : undefined}
  >
    <div data-site-section-inner="">
      <header data-site-section-header="">
        <h2 id={`${id}-title`}>{title}</h2>
        {lead === undefined ? null : <p data-site-lead="">{lead}</p>}
      </header>
      {children}
    </div>
  </section>
);
