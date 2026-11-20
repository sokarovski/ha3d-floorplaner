import type { ReactElement, ReactNode } from "react";

type SectionProps = Readonly<{
  id: string;
  // Without a title the section has no header (its groups carry their own headings).
  title?: string;
  lead?: ReactNode;
  tone?: "plain" | "surface";
  size?: "normal" | "large";
  align?: "start" | "center";
  children: ReactNode;
}>;

export const Section = ({
  id,
  title,
  lead,
  tone = "plain",
  size = "normal",
  align = "start",
  children,
}: SectionProps): ReactElement => (
  <section
    id={id}
    aria-labelledby={title === undefined ? undefined : `${id}-title`}
    data-site-section=""
    data-site-section-surface={tone === "surface" ? "" : undefined}
    data-site-section-large={size === "large" ? "" : undefined}
    data-site-section-centered={align === "center" || size === "large" ? "" : undefined}
  >
    <div data-site-section-inner="">
      {title === undefined ? null : (
        <header data-site-section-header="">
          <h2 id={`${id}-title`}>{title}</h2>
          {lead === undefined ? null : <p data-site-lead="">{lead}</p>}
        </header>
      )}
      {children}
    </div>
  </section>
);
