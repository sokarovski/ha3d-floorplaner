import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router";
import { useStore } from "zustand";
import { Button } from "../../../design-system/components/Button/Button";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { IconSelectMenu } from "../../../design-system/components/IconSelectMenu/IconSelectMenu";
import { Icon } from "../../../design-system/components/Icon/Icon";
import { Tooltip } from "../../../design-system/components/Tooltip/Tooltip";
import { paths } from "../../../app/routes/paths";
import { useHistoryState, useHouse, useSaveState, useSession, useUi } from "../hooks/sessionContext";
import {
  contextLabel,
  editPathKey,
  editPathOf,
  enterHouseOverview,
  leaveEditLevel,
  leaveToDepth,
  levelName,
} from "../services/editContext";
import { setWallFaceSide } from "../services/treeActions";
import { pruneSelection, unhideAll } from "../services/hideActions";
import { writeEffectsOn } from "../services/effectsSetting";
import { hasUnsavedRevision } from "../services/saveStatusText";
import { floorHasSavedHidden } from "@shared/domain/house/visibility";
import { hasHouseOverview } from "@shared/domain/house/floorPlacement";
import { SaveStatusIndicator } from "./SaveStatusIndicator";

type BuilderHeaderProps = Readonly<{
  extraActions?: ReactNode;
  onOpenSettings: () => void;
}>;

/** Sun view (owner 2026-11-16): the house's sun, day, or night; session-only, never saved. */
const sunOptions = [
  { id: "house", icon: "home", label: "Sun from the house (location and time)" },
  { id: "day", icon: "sun", label: "Day: a bright daytime sun" },
  { id: "night", icon: "moon", label: "Night: no sun, the lamps light the house" },
] as const;

/** Light controls (owner, Phase 5 follow-up): pins and handles hidden, shown, or focus on lights. */
const lightOptions = [
  { id: "hidden", icon: "eyeOff", label: "Light controls hidden" },
  { id: "shown", icon: "eye", label: "Light controls shown (pins and handles)" },
  { id: "focus", icon: "lightFocus", label: "Lights focus (dim everything else)" },
] as const;

const sunViewOf = (id: string): "house" | "day" | "night" | undefined =>
  sunOptions.find((option) => option.id === id)?.id;
const lightControlsOf = (id: string): "hidden" | "shown" | "focus" | undefined =>
  lightOptions.find((option) => option.id === id)?.id;

export const BuilderHeader = ({ extraActions, onOpenSettings }: BuilderHeaderProps): ReactElement => {
  const session = useSession();
  const name = useHouse((house) => house.name);
  const floorName = useHouse(
    (house) => house.floors.find((floor) => floor.id === session.ui.getState().activeFloorId)?.name ?? "",
  );
  const activeFloorId = useUi((ui) => ui.activeFloorId);
  const mode = useUi((ui) => ui.mode);
  const houseOverview = useUi((ui) => ui.houseOverview);
  // A multi-floor house has the whole-house level above the floors (Phase 16.4): the open floor is a context.
  const floorContext = useHouse(hasHouseOverview) && !houseOverview;
  const viewMode = useUi((ui) => ui.viewMode);
  const showOthers = useUi((ui) => ui.showOthers);
  const wallsVisible = useUi((ui) => ui.wallsVisible);
  const lightControls = useUi((ui) => ui.lightControls);
  const lightsOn = useUi((ui) => ui.lightsOn);
  const sunView = useUi((ui) => ui.sunView);
  const effectsOn = useUi((ui) => ui.effectsOn);
  const focusWallFace = useUi((ui) => ui.focusWallFace);
  const hiddenCount = useUi((ui) => ui.hiddenIds.length);
  const showHidden = useUi((ui) => ui.showHidden);
  const anySavedHidden = useHouse((house) => house.floors.some(floorHasSavedHidden));
  // Re-render on any level change; the path itself is derived from the store's focus fields.
  useUi(editPathKey);
  const path = editPathOf(session.ui.getState());
  // A roof's level (Phase 19.1) sits directly under the whole house: no floor crumb.
  const roofOpen = path[0]?.kind === "roof";
  const crumbs = useHouse((house) =>
    path.map((context) => contextLabel(house, session.ui.getState().activeFloorId, context)).join("\u0000"),
  ).split("\u0000");
  const canUndo = useHistoryState((history) => history.past.length > 0);
  const canRedo = useHistoryState((history) => history.future.length > 0);
  const undoLabel = useHistoryState((history) => history.past[history.past.length - 1]?.label);
  const redoLabel = useHistoryState((history) => history.future[0]?.label);
  const saving = useSaveState((save) => save.revisionInProgress);
  const generation = useStore(session.documents, (state) => state.generation);
  const unsaved = useSaveState((save) => hasUnsavedRevision(save, generation));
  // Phase 13.2 (owner): no "Saved" status; Save is enabled only when there is something to save.
  return (
    <div data-builder-header="" data-active-floor={activeFloorId}>
      <Link to={paths.houses()} data-builder-back="" aria-label="Back to houses">
        <Icon name="back" />
        Houses
      </Link>
      <div data-builder-title="">
        <span data-builder-house-name="">{name}</span>
        {houseOverview ? null : <span data-builder-floor-name="">{floorName}</span>}
        <span data-builder-mode="">{levelName(path, houseOverview)}</span>
      </div>
      {mode === "overview" && !floorContext && path.length === 0 ? null : (
        <div data-editor-bar="" role="group" aria-label="Editor session">
          <span data-editor-bar-label="">
            Editing{" "}
            {floorContext ? (
              <span>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    enterHouseOverview(session);
                  }}
                >
                  House
                </Button>{" "}
                ›{" "}
              </span>
            ) : null}
            {floorContext && path.length === 0 ? <strong>{floorName}</strong> : null}
            {floorContext && path.length > 0 && !roofOpen ? (
              <span>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    leaveToDepth(session, 0);
                  }}
                >
                  {floorName}
                </Button>{" "}
                ›{" "}
              </span>
            ) : null}
            {path.map((context, index) =>
              index === path.length - 1 ? (
                <strong key={context.kind}>{crumbs[index]}</strong>
              ) : (
                <span key={context.kind}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      leaveToDepth(session, index + 1);
                    }}
                  >
                    {crumbs[index]}
                  </Button>{" "}
                  ›{" "}
                </span>
              ),
            )}
            {focusWallFace === undefined ? null : (
              <>
                {" "}
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    setWallFaceSide(session, focusWallFace.side === "interior" ? "exterior" : "interior");
                  }}
                >
                  {focusWallFace.side === "interior" ? "Show exterior" : "Show interior"}
                </Button>
              </>
            )}
          </span>
          <Tooltip
            content={
              roofOpen
                ? "Close the roof: back to the whole house (Escape)"
                : mode === "overview"
                  ? "Close the floor: back to the whole house (Escape)"
                  : "One level up (Escape)"
            }
            placement="bottom"
          >
            <Button
              size="sm"
              onPress={() => {
                leaveEditLevel(session);
              }}
            >
              Done
            </Button>
          </Tooltip>
        </div>
      )}
      {/* The view and edit tools; at very narrow widths this group scrolls, never the page (13.2). */}
      <div data-builder-header-actions="">
        {mode === "overview" ? null : (
          <Tooltip
            content={
              showOthers ? "Show others: faded (press to hide)" : "Show others: hidden (press to fade)"
            }
            placement="bottom"
          >
            <IconButton
              icon={showOthers ? "eye" : "eyeOff"}
              label={showOthers ? "Hide other rooms" : "Show other rooms"}
              variant={showOthers ? "secondary" : "ghost"}
              onPress={() => {
                session.ui.setState({ showOthers: !showOthers });
              }}
            />
          </Tooltip>
        )}
        {/* Hide and Hidden (Phase 7.5): both session-only; the saved Hidden flag is a property. */}
        {hiddenCount === 0 ? null : (
          <Tooltip content="Show everything hidden in this session (eye or ⇧H)" placement="bottom">
            <Button
              size="sm"
              variant="secondary"
              onPress={() => {
                unhideAll(session);
              }}
            >
              Unhide all ({hiddenCount})
            </Button>
          </Tooltip>
        )}
        {!anySavedHidden && !showHidden ? null : (
          <Tooltip
            content={
              showHidden
                ? "Show hidden on: items saved as Hidden are drawn faded (press to leave them out)"
                : "Show hidden off: items saved as Hidden are not drawn (press to draw them faded)"
            }
            placement="bottom"
          >
            <Button
              size="sm"
              variant={showHidden ? "secondary" : "ghost"}
              onPress={() => {
                session.ui.setState({ showHidden: !showHidden });
                pruneSelection(session);
              }}
            >
              Show hidden
            </Button>
          </Tooltip>
        )}
        <Tooltip
          content={
            wallsVisible
              ? "Walls on: press to hide walls and trace them on the floor"
              : "Walls off: walls are traced on the floor (press to show them)"
          }
          placement="bottom"
        >
          <IconButton
            icon="wall"
            label={wallsVisible ? "Walls off" : "Walls on"}
            variant={wallsVisible ? "secondary" : "ghost"}
            onPress={() => {
              session.ui.setState({ wallsVisible: !wallsVisible });
            }}
          />
        </Tooltip>
        <IconSelectMenu
          label="Sun view"
          tooltip="Sun view: house, day, or night"
          options={sunOptions}
          selectedId={sunView}
          onSelect={(id) => {
            const next = sunViewOf(id);
            if (next !== undefined) session.ui.setState({ sunView: next });
          }}
        />
        {/* Lights (Phase 13.2): the light-controls choice, then Lights on/off (Phase 7.9) after a separator. */}
        <IconSelectMenu
          label="Lights"
          tooltip={lightsOn ? "Lights: controls and on/off" : "Lights are switched off (open to switch on)"}
          active={lightControls !== "hidden"}
          options={lightOptions}
          selectedId={lightControls}
          onSelect={(id) => {
            const next = lightControlsOf(id);
            if (next !== undefined) session.ui.setState({ lightControls: next });
          }}
          actions={[
            lightsOn
              ? { id: "lights", icon: "lightOff", label: "Switch all lights off" }
              : { id: "lights", icon: "light", label: "Switch all lights on" },
          ]}
          onAction={() => {
            session.ui.setState({ lightsOn: !lightsOn });
          }}
        />
        {/* Ambient effects on/off (D24, owner 2026-11-16: one global play/pause next to the lights). */}
        <Tooltip
          content={
            effectsOn
              ? "Effects playing: swirls and vapour run every 20 s (press to pause and hide them)"
              : "Effects paused (press to play every effect now, then every 20 s)"
          }
          placement="bottom"
        >
          <IconButton
            icon={effectsOn ? "pause" : "play"}
            label={effectsOn ? "Pause effects" : "Play effects"}
            variant={effectsOn ? "secondary" : "ghost"}
            onPress={() => {
              writeEffectsOn(!effectsOn);
              session.ui.setState({ effectsOn: !effectsOn });
            }}
          />
        </Tooltip>
        <div data-builder-segment="" role="group" aria-label="View">
          <Button
            size="sm"
            variant={viewMode === "top" ? "secondary" : "ghost"}
            onPress={() => {
              session.ui.setState({ viewMode: "top" });
            }}
          >
            Top
          </Button>
          <Button
            size="sm"
            variant={viewMode === "3d" ? "secondary" : "ghost"}
            onPress={() => {
              session.ui.setState({ viewMode: "3d" });
            }}
          >
            3D
          </Button>
        </div>
        <Tooltip
          content={canUndo ? `Undo: ${undoLabel ?? ""}` : "Nothing to undo"}
          shortcut="⌘Z"
          placement="bottom"
        >
          <IconButton
            icon="undo"
            label="Undo"
            disabled={!canUndo}
            onPress={() => {
              session.undo();
            }}
          />
        </Tooltip>
        <Tooltip
          content={canRedo ? `Redo: ${redoLabel ?? ""}` : "Nothing to redo"}
          shortcut="⇧⌘Z"
          placement="bottom"
        >
          <IconButton
            icon="redo"
            label="Redo"
            disabled={!canRedo}
            onPress={() => {
              session.redo();
            }}
          />
        </Tooltip>
        {extraActions}
      </div>
      {/* Always visible at the right edge (13.2): problems only (failed/conflict), Settings, and Save. */}
      <div data-builder-header-commit="">
        <SaveStatusIndicator />
        <IconButton icon="settings" label="Settings" onPress={onOpenSettings} />
        <Tooltip content={unsaved ? "Save a revision (⌘S)" : "Nothing to save"} placement="bottom">
          <Button
            busy={saving}
            disabled={!unsaved && !saving}
            onPress={() => {
              void session.save.saveRevision();
            }}
          >
            Save
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
