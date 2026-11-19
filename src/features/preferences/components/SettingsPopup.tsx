import type { ReactElement } from "react";
import { settingsForm } from "@shared/domain/schemas/forms/settingsForms";
import { withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { useAppServices } from "../../../app/appServicesContext";
import { schemeFromPreference, schemeToRgb } from "../../../design-system/tokens/colorScheme";
import { usePreferences } from "../hooks/usePreferences";
import { readPreferencesPatch } from "../services/preferencesPatch";

type SettingsPopupProps = Readonly<{
  open: boolean;
  onClose: () => void;
}>;

/**
 * Settings apply instantly (Phase 5.9, owner H10): a live form whose every change goes straight to the
 * preferences service (applied locally at once, synced in the background); Done only closes.
 */
export const SettingsPopup = ({ open, onClose }: SettingsPopupProps): ReactElement | null => {
  const { preferences } = useAppServices();
  const current = usePreferences((value) => value);
  return (
    <Popup
      open={open}
      title="Settings"
      onClose={onClose}
      footer={
        <Button
          onPress={() => {
            onClose();
          }}
        >
          Done
        </Button>
      }
    >
      <SchemaForm
        schema={settingsForm}
        value={current}
        registry={genericEditors}
        projectUnit="mm"
        mode="live"
        onCommit={(path, next) => {
          // Switching to Custom starts from the colours of the scheme in use, so every custom field has a value.
          const seeded =
            path.join("/") === "appearance/colorScheme" &&
            next === "custom" &&
            current.appearance.customColors === undefined
              ? withValueAtPath(
                  current,
                  ["appearance", "customColors"],
                  schemeToRgb(schemeFromPreference(current.appearance.colorScheme, undefined)),
                )
              : current;
          const patch = readPreferencesPatch(withValueAtPath(seeded, path, next));
          if (patch === undefined) return false;
          preferences.update(patch);
          return true;
        }}
      />
    </Popup>
  );
};
