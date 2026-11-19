import type { ReactElement, ReactNode } from "react";
import type { CapabilityGroup } from "../content/possibilities";
import { AnimatedClip } from "./AnimatedClip";
import { CapabilityList } from "./CapabilityList";
import { ScreenshotFigure } from "./ScreenshotFigure";
import { screenshots } from "../content/screenshots";

type CapabilityGroupViewProps = Readonly<{
  group: CapabilityGroup;
  children?: ReactNode;
}>;

// One titled group of capabilities, with its captures (when there are real ones) beside the list.
export const CapabilityGroupView = ({ group, children }: CapabilityGroupViewProps): ReactElement => {
  const media = group.media ?? [];
  // A single small capture is shown near its own width rather than stretched.
  const narrow = media.length === 1 && media.every((entry) => screenshots[entry.name].width < 700);
  return (
    <section id={group.id} aria-labelledby={`${group.id}-title`} data-site-group="">
      <header data-site-group-header="">
        <h3 id={`${group.id}-title`}>{group.title}</h3>
        {group.lead === undefined ? null : <p>{group.lead}</p>}
      </header>
      {media.length === 0 ? null : (
        <div
          data-site-group-media=""
          data-site-group-media-pair={media.length === 2 ? "" : undefined}
          data-site-group-media-row={media.length > 2 ? "" : undefined}
          data-site-group-media-narrow={narrow ? "" : undefined}
        >
          {media.map((entry) =>
            entry.kind === "clip" ? (
              <AnimatedClip key={entry.name} name={entry.name} />
            ) : (
              <ScreenshotFigure key={entry.name} name={entry.name} />
            ),
          )}
        </div>
      )}
      <CapabilityList label={group.title} items={group.items} />
      {children}
    </section>
  );
};
