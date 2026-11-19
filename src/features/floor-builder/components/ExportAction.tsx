import { useState } from "react";
import type { ReactElement } from "react";
import { MenuButton } from "../../../design-system/components/MenuButton/MenuButton";
import { useUi } from "../hooks/sessionContext";
import { useCapabilities } from "../hooks/useCapabilities";
import { ExportPngPopup } from "./ExportPngPopup";
import { RenderPopup } from "./RenderPopup";

/**
 * Export and Render merged into one header control (owner, Phase 13.2): a menu with the PNG export and the
 * photorealistic render. The render needs the overview and an available render backend.
 */
export const ExportAction = (): ReactElement => {
  const mode = useUi((ui) => ui.mode);
  const capabilities = useCapabilities();
  const [open, setOpen] = useState<"png" | "render" | null>(null);
  const available = capabilities?.photorealRender.available === true;
  const reason =
    mode !== "overview"
      ? "only from the house overview"
      : (capabilities?.photorealRender.reason ?? "checking the render backend…");
  return (
    <>
      <MenuButton
        label="Export"
        icon="export"
        placement="bottom end"
        items={[
          { id: "png", label: "Export PNG…", icon: "image" },
          {
            id: "render",
            label: available && mode === "overview" ? "Photorealistic render…" : `Render (${reason})`,
            icon: "sun",
            disabled: !available || mode !== "overview",
          },
        ]}
        onAction={(id) => {
          setOpen(id === "render" ? "render" : "png");
        }}
      />
      <ExportPngPopup
        open={open === "png"}
        onClose={() => {
          setOpen(null);
        }}
      />
      <RenderPopup
        open={open === "render"}
        onClose={() => {
          setOpen(null);
        }}
      />
    </>
  );
};
