import type { ReactElement, ReactNode } from "react";
import type { ScreenshotName } from "../content/screenshots";
import { screenshots, screenshotUrl } from "../content/screenshots";
import { LinkButton } from "./LinkButton";
import { Section } from "./Section";

type PartCardProps = Readonly<{
  shot: ScreenshotName;
  title: string;
  children: ReactNode;
}>;

// One of the two parts: a small screenshot (no caption), a large centred title, then what it is for.
const PartCard = ({ shot, title, children }: PartCardProps): ReactElement => (
  <article data-site-card="" data-site-part-card="">
    <img
      src={screenshotUrl(screenshots[shot].file)}
      alt={screenshots[shot].alt}
      width={screenshots[shot].width}
      height={screenshots[shot].height}
      loading="lazy"
      decoding="async"
      data-site-part-image=""
    />
    <h3>{title}</h3>
    {children}
  </article>
);

// The top of the Learn More page: which of the two parts a visitor needs, each linking to its section below.
export const WhatYouNeed = (): ReactElement => (
  <Section id="what-you-need" title="What do you need?" size="large">
    <div data-site-grid="" data-site-grid-2="">
      <PartCard shot="ha-widgets" title="Integration">
        <ul data-site-card-list="">
          <li>You need the Integration if you want to show your home in Home Assistant.</li>
          <li>It connects your house to a custom panel and to your Home Assistant entities.</li>
          <li>The App is not needed to run the Integration.</li>
        </ul>
        <div data-site-part-action="">
          <LinkButton href="#viewer" icon="chevronRight">
            Learn More
          </LinkButton>
        </div>
      </PartCard>
      <PartCard shot="planner-detail" title="App (add-on)">
        <ul data-site-card-list="">
          <li>You need the App if you want to build your home in 3D.</li>
          <li>Once your home is built, the App is not needed any more.</li>
          <li>You can even run it just once on a laptop, and be done with it when your house is finished.</li>
        </ul>
        <div data-site-part-action="">
          <LinkButton href="#builder" icon="chevronRight">
            Learn More
          </LinkButton>
        </div>
      </PartCard>
    </div>
  </Section>
);
