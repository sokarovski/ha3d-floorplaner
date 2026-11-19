// The panel_custom module entry (spec/home-assistant/viewer-mvp.md). Elements are defined once per page.
import { HomeplanConnectionSettings } from "./connectionSettings";
import { HomeplanAreaPanel } from "./areaPanel";
import { HomeplanBindingEditor } from "./bindingEditor";
import { HomeplanBindingFields } from "./bindingFields";
import { HomeplanBubbleEditor } from "./bubbleEditor";
import { HomeplanBubbleOverlay } from "./bubbleOverlay";
import { HomeplanConditionEditor } from "./conditionEditor";
import { HomeplanEffectBinding } from "./effectBinding";
import { HomeplanEntitySuggestions } from "./entitySuggestions";
import { HomeplanFloorWidgetSetting } from "./floorWidgetSetting";
import { HomeplanFloorWidgets } from "./floorWidgets";
import { HomeplanHouseSettings } from "./houseSettings";
import { HomeplanLightOutputSetting } from "./lightOutputSetting";
import { HomeplanPresenceSetting } from "./presenceSetting";
import { HomeplanRoomBubbles } from "./roomBubbles";
import { HomeplanRoomTabSetting } from "./roomTabSetting";
import { HomeplanSetupScreen } from "./setupScreen";
import { HomeplanStateBindings } from "./stateBindings";
import { HomeplanViewerScreen } from "./viewerScreen";

const define = (name: string, element: CustomElementConstructor): void => {
  if (customElements.get(name) === undefined) customElements.define(name, element);
};

define("homeplan-area-panel", HomeplanAreaPanel);
define("homeplan-binding-editor", HomeplanBindingEditor);
define("homeplan-binding-fields", HomeplanBindingFields);
define("homeplan-condition-editor", HomeplanConditionEditor);
define("homeplan-effect-binding", HomeplanEffectBinding);
define("homeplan-entity-suggestions", HomeplanEntitySuggestions);
define("homeplan-floor-widget-setting", HomeplanFloorWidgetSetting);
define("homeplan-floor-widgets", HomeplanFloorWidgets);
define("homeplan-presence-setting", HomeplanPresenceSetting);
define("homeplan-state-bindings", HomeplanStateBindings);
define("homeplan-bubble-editor", HomeplanBubbleEditor);
define("homeplan-bubble-overlay", HomeplanBubbleOverlay);
define("homeplan-room-bubbles", HomeplanRoomBubbles);
define("homeplan-room-tab-setting", HomeplanRoomTabSetting);
define("homeplan-house-settings", HomeplanHouseSettings);
define("homeplan-light-output", HomeplanLightOutputSetting);
define("homeplan-setup-screen", HomeplanSetupScreen);
define("homeplan-viewer-screen", HomeplanViewerScreen);

define("homeplan-connection-settings", HomeplanConnectionSettings);
