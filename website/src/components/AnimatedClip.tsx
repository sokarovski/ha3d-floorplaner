import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../src/design-system/components/Button/Button";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import { screenshots, screenshotUrl } from "../content/screenshots";
import type { ScreenshotName } from "../content/screenshots";

type AnimatedClipProps = Readonly<{
  name: ScreenshotName;
}>;

// A short looping clip that shows its still poster until the visitor asks it to play.
export const AnimatedClip = ({ name }: AnimatedClipProps): ReactElement => {
  const shot = screenshots[name];
  const [playing, setPlaying] = useState(false);
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
      <figcaption>
        {shot.caption}
        {shot.available ? null : <span data-site-figure-note=""> (animation coming soon)</span>}
      </figcaption>
    </figure>
  );
};
