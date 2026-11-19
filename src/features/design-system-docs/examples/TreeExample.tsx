import { useState } from "react";
import type { ReactElement } from "react";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { MenuButton } from "../../../design-system/components/MenuButton/MenuButton";
import { Tree } from "../../../design-system/components/Tree/Tree";
import { TreeItem } from "../../../design-system/components/TreeItem/TreeItem";

export const TreeExample = (): ReactElement => {
  const [selected, setSelected] = useState<readonly string[]>(["living"]);
  const [expanded, setExpanded] = useState<readonly string[]>(["floor", "living"]);
  const [activated, setActivated] = useState<string>();
  const [wallHidden, setWallHidden] = useState(true);
  return (
    <div data-ds-example-box="">
      <Tree
        label="House"
        selectedIds={selected}
        onSelectionChange={setSelected}
        onAction={setActivated}
        expandedIds={expanded}
        onExpandedChange={setExpanded}
        disabledIds={["kitchen"]}
      >
        <TreeItem
          id="floor"
          label="Etage1"
          icon="layers"
          containsSelection={selected.some((id) => id !== "floor")}
          actions={
            <MenuButton
              label="Add to floor"
              icon="plus"
              size="sm"
              items={[{ id: "area", label: "Area" }]}
              onAction={() => undefined}
            />
          }
        >
          <TreeItem
            id="living"
            label="Living Room"
            icon="rectangle"
            actions={
              <>
                <IconButton icon="trash" label="Delete Living Room" size="sm" />
                <IconButton icon="frame" label="Fit Living Room to screen" size="sm" />
                <MenuButton
                  label="Add to Living Room"
                  icon="plus"
                  size="sm"
                  items={[{ id: "object", label: "Object" }]}
                  onAction={() => undefined}
                />
              </>
            }
          >
            <TreeItem id="walls" label="Walls" icon="wall" badge="(3)">
              <TreeItem
                id="wall"
                label="Wall (bottom)"
                icon="wall"
                faded={wallHidden}
                actions={
                  wallHidden ? undefined : (
                    <IconButton
                      icon="eye"
                      label="Hide Wall (bottom)"
                      size="sm"
                      onPress={() => {
                        setWallHidden(true);
                      }}
                    />
                  )
                }
                pinnedAction={
                  wallHidden ? (
                    <IconButton
                      icon="eyeOff"
                      label="Show Wall (bottom)"
                      size="sm"
                      onPress={() => {
                        setWallHidden(false);
                      }}
                    />
                  ) : undefined
                }
              />
              <TreeItem id="saved" label="Wall (top), saved hidden" icon="wall" muted faded />
              <TreeItem id="orphan" label="Wall (left)" icon="wall" warning />
            </TreeItem>
          </TreeItem>
          <TreeItem
            id="kitchen"
            label="Kitchen (disabled while editing Living Room)"
            icon="rectangle"
            disabled
          />
        </TreeItem>
      </Tree>
      <p aria-live="polite">
        {activated === undefined
          ? "Double-click a row or press Enter to activate it."
          : `Activated: ${activated}`}
      </p>
    </div>
  );
};
