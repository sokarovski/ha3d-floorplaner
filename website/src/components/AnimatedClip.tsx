import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../src/design-system/components/Button/Button";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import { screenshots, screenshotUrl } from "../content/screenshots";
import type { ScreenshotName } from "../content/screenshots";

type AnimatedClipProps = Readonly<{
  name: ScreenshotName;
  caption?: boolean;
}>;

// Visitors who ask for reduced motion start on the still poster.
const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A short looping clip that plays on its own, with a control to stop it (or start it, for reduced motion).
export const AnimatedClip = ({ name, caption = true }: AnimatedClipProps): ReactElement => {
  const shot = screenshots[name];
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const still = shot.poster ?? shot.file;
  return (
    <figure data-site-figure="">
      {shot.available ? (
        <div data-site-clip="">
          <img
            src={screenshotUrl(playing ? shot.file : still)}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            loading="lazy"
            decoding="async"
            data-site-figure-image=""
          />
          <div data-site-clip-control="">
            <Button variant="secondary" size="sm" onPress={() => setPlaying((value) => !value)}>
              <Icon name={playing ? "pause" : "play"} size="sm" />
              {playing ? "Stop animation" : "Play animation"}
            </Button>
          </div>
        </div>
      ) : (
        <div data-site-placeholder="" role="img" aria-label={`Animation coming soon. ${shot.alt}`}>
          <Icon name="play" size="lg" />
          <span>Animation coming soon</span>
        </div>
      )}
      {caption ? (
        <figcaption>
          {shot.caption}
          {shot.available ? null : <span data-site-figure-note=""> (animation coming soon)</span>}
        </figcaption>
      ) : null}
    </figure>
  );
};
