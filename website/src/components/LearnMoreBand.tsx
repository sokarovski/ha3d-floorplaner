import type { ReactElement } from "react";
import type { LearnMoreArea } from "../content/learnMore";
import { AnimatedClip } from "./AnimatedClip";
import { LinkButton } from "./LinkButton";
import { ScreenshotFigure } from "./ScreenshotFigure";

type LearnMoreBandProps = Readonly<{
  area: LearnMoreArea;
  tone: "plain" | "surface";
}>;

// One full-width Learn More area. "bullets": title and bullets on the left (6/10), one uncaptioned picture on
// the right (4/10), with an optional link button under the bullets. "tiles": the title over a row of cards, each a picture with a short heading under it.
export const LearnMoreBand = ({ area, tone }: LearnMoreBandProps): ReactElement => (
  <section
    id={area.id}
    aria-labelledby={`${area.id}-title`}
    data-site-section=""
    data-site-section-surface={tone === "surface" ? "" : undefined}
  >
    <div data-site-section-inner="">
      {area.kind === "bullets" ? (
        <div data-site-band="">
          <div data-site-band-text="">
            <h2 id={`${area.id}-title`}>{area.title}</h2>
            <ul data-site-band-list="">
              {area.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            {area.action === undefined ? null : (
              <div data-site-actions="">
                <LinkButton href={area.action.href} icon="chevronRight">
                  {area.action.label}
                </LinkButton>
              </div>
            )}
          </div>
          <div data-site-band-media="">
            {area.media.kind === "clip" ? (
              <AnimatedClip name={area.media.name} caption={false} />
            ) : (
              <ScreenshotFigure name={area.media.name} caption={false} />
            )}
          </div>
        </div>
      ) : (
        <div data-site-band-tiles="">
          <h2 id={`${area.id}-title`}>{area.title}</h2>
          <div data-site-grid="" data-site-grid-4="">
            {area.tiles.map((tile) => (
              <article key={tile.title} data-site-card="" data-site-band-tile="">
                <ScreenshotFigure name={tile.image} caption={false} />
                <h3>{tile.title}</h3>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  </section>
);
