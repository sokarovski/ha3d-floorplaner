import type { ReactElement } from "react";

type LearnMoreChapterProps = Readonly<{
  id: string;
  title: string;
  tone: "plain" | "surface";
}>;

// A short section that only names the Learn More areas below it, with a large centred title.
export const LearnMoreChapter = ({ id, title, tone }: LearnMoreChapterProps): ReactElement => (
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    data-site-section=""
    data-site-section-surface={tone === "surface" ? "" : undefined}
    data-site-section-large=""
    data-site-section-centered=""
    data-site-chapter=""
  >
    <div data-site-section-inner="">
      <header data-site-section-header="">
        <h2 id={`${id}-title`}>{title}</h2>
      </header>
    </div>
  </section>
);
