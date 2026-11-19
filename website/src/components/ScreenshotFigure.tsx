import type { ReactElement } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import { screenshots, screenshotUrl } from "../content/screenshots";
import type { ScreenshotName } from "../content/screenshots";

type ScreenshotFigureProps = Readonly<{
  name: ScreenshotName;
  priority?: boolean;
}>;

// A product capture with its caption, or a clearly marked placeholder while the capture is not available yet.
export const ScreenshotFigure = ({ name, priority = false }: ScreenshotFigureProps): ReactElement => {
  const shot = screenshots[name];
  return (
    <figure data-site-figure="">
      {shot.available ? (
        <img
          src={screenshotUrl(shot.file)}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          data-site-figure-image=""
        />
      ) : (
        <div
          data-site-placeholder=""
          data-site-placeholder-wide={shot.width / shot.height > 2 ? "" : undefined}
          role="img"
          aria-label={`Screenshot coming soon. ${shot.alt}`}
        >
          <Icon name="image" size="lg" />
          <span>Screenshot coming soon</span>
        </div>
      )}
      <figcaption>
        {shot.caption}
        {shot.available ? null : <span data-site-figure-note=""> (screenshot coming soon)</span>}
      </figcaption>
    </figure>
  );
};
