// Readout text for the template preview's latest status event.
import type { TemplatePreviewEvent } from "../../../renderer/templatePreviewTypes";

export const describePreviewStatus = (event: TemplatePreviewEvent | null): string => {
  if (event === null) return "Preparing the preview…";
  switch (event.type) {
    case "unsupported":
      return `The 3D preview needs WebGL2, which is not available here. ${event.reason}`;
    case "loading":
      return "Loading the model…";
    case "loadError":
      return `The model could not be loaded: ${event.message}`;
    case "resized":
      return event.ok
        ? `Size ${event.sizeMm.x.toFixed(0)} × ${event.sizeMm.y.toFixed(0)} × ${event.sizeMm.z.toFixed(0)} mm (W × H × D)`
        : `The template cannot be resized: ${event.issues.join("; ")}`;
    case "pick":
      return event.nodeName === null ? "No part selected" : `Selected ${event.nodeName}`;
  }
};
