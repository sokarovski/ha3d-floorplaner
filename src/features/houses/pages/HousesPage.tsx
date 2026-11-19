import { useCallback, useState } from "react";
import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import type { HouseCardValue, TrashedHouseValue, ValidHouseCardValue } from "@shared/contracts/houses";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Button } from "../../../design-system/components/Button/Button";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { Spinner } from "../../../design-system/components/Spinner/Spinner";
import { useAppServices } from "../../../app/appServicesContext";
import { paths } from "../../../app/routes/paths";
import { SettingsPopup } from "../../preferences/components/SettingsPopup";
import { ConfirmPopup } from "../components/ConfirmPopup";
import { HouseCard } from "../components/HouseCard";
import { NewHousePopup } from "../components/NewHousePopup";
import { RenameHousePopup } from "../components/RenameHousePopup";
import { TrashList } from "../components/TrashList";
import { useHousesAutomation } from "../hooks/useHousesAutomation";
import { useResource } from "../hooks/useResource";

export const HousesPage = (): ReactElement => {
  const { houses } = useAppServices();
  const navigate = useNavigate();
  const [view, setView] = useState<"houses" | "trash">("houses");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState<ValidHouseCardValue | undefined>(undefined);
  const [deleting, setDeleting] = useState<HouseCardValue | undefined>(undefined);
  const [purging, setPurging] = useState<TrashedHouseValue | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const list = useResource(useCallback((signal: AbortSignal) => houses.list(signal), [houses]));
  const trash = useResource(useCallback((signal: AbortSignal) => houses.listTrash(signal), [houses]));
  const reloadAll = (): void => {
    list.reload();
    trash.reload();
  };
  useHousesAutomation(reloadAll, (houseId) => {
    void navigate(paths.house(houseId));
  });

  return (
    <div data-houses-page="">
      <header data-houses-header="">
        <h1 data-houses-title="">Houses</h1>
        <div data-houses-actions="">
          <Button
            variant={view === "houses" ? "secondary" : "ghost"}
            onPress={() => {
              setView("houses");
            }}
          >
            Houses
          </Button>
          <Button
            variant={view === "trash" ? "secondary" : "ghost"}
            onPress={() => {
              setView("trash");
              trash.reload();
            }}
          >
            Trash
            {trash.state.data === undefined || trash.state.data.length === 0
              ? ""
              : ` (${String(trash.state.data.length)})`}
          </Button>
          <IconButton
            icon="settings"
            label="Settings"
            onPress={() => {
              setSettingsOpen(true);
            }}
          />
          <Button
            onPress={() => {
              setCreating(true);
            }}
          >
            New house
          </Button>
        </div>
      </header>
      <main data-houses-main="">
        {actionError === undefined ? null : (
          <Banner
            tone="danger"
            actions={
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  setActionError(undefined);
                }}
              >
                Dismiss
              </Button>
            }
          >
            {actionError}
          </Banner>
        )}
        {view === "trash" ? (
          trash.state.status === "error" ? (
            <Banner
              tone="danger"
              actions={
                <Button size="sm" variant="secondary" onPress={trash.reload}>
                  Retry
                </Button>
              }
            >
              {trash.state.message}
            </Banner>
          ) : trash.state.data === undefined ? (
            <Spinner label="Loading trash" />
          ) : (
            <TrashList
              houses={trash.state.data}
              onRestore={(houseId) => {
                houses.restore(houseId).then(reloadAll, (error: unknown) => {
                  setActionError(error instanceof Error ? error.message : "Restore failed.");
                });
              }}
              onPurge={setPurging}
            />
          )
        ) : list.state.status === "error" ? (
          <Banner
            tone="danger"
            actions={
              <Button size="sm" variant="secondary" onPress={list.reload}>
                Retry
              </Button>
            }
          >
            The houses could not be loaded: {list.state.message}
          </Banner>
        ) : list.state.data === undefined ? (
          <div data-house-grid="" aria-busy="true">
            <div data-house-card="" data-house-card-skeleton="" />
            <div data-house-card="" data-house-card-skeleton="" />
            <div data-house-card="" data-house-card-skeleton="" />
          </div>
        ) : list.state.data.length === 0 ? (
          <div data-houses-empty="">
            <p>No houses yet.</p>
            <Button
              onPress={() => {
                setCreating(true);
              }}
            >
              Create house
            </Button>
          </div>
        ) : (
          <div data-house-grid="">
            {list.state.data.map((house) => (
              <HouseCard
                key={house.id}
                house={house}
                onAction={(action, target) => {
                  if (action === "rename" && target.status === "ok") setRenaming(target);
                  else if (action === "clone")
                    void houses.clone(target.id).then(
                      () => {
                        setActionError(undefined);
                        list.reload();
                      },
                      (error: unknown) => {
                        setActionError(
                          error instanceof Error ? error.message : "The house could not be cloned.",
                        );
                      },
                    );
                  else if (action === "delete") setDeleting(target);
                }}
              />
            ))}
          </div>
        )}
      </main>
      <NewHousePopup
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(houseId) => {
          setCreating(false);
          void navigate(paths.house(houseId));
        }}
      />
      <RenameHousePopup
        house={renaming}
        onClose={() => {
          setRenaming(undefined);
        }}
        onRenamed={() => {
          setRenaming(undefined);
          list.reload();
        }}
      />
      <ConfirmPopup
        open={deleting !== undefined}
        title="Delete house?"
        confirmLabel="Move to trash"
        onClose={() => {
          setDeleting(undefined);
        }}
        onConfirm={async () => {
          if (deleting === undefined) return;
          await houses.trash(deleting.id);
          setDeleting(undefined);
          reloadAll();
        }}
      >
        <p>
          “{deleting === undefined ? "" : deleting.status === "ok" ? deleting.name : deleting.id}” moves to
          the trash. You can restore it from the Trash view.
        </p>
      </ConfirmPopup>
      <ConfirmPopup
        open={purging !== undefined}
        title="Delete permanently?"
        confirmLabel="Delete permanently"
        onClose={() => {
          setPurging(undefined);
        }}
        onConfirm={async () => {
          if (purging === undefined) return;
          await houses.purge(purging.house.id);
          setPurging(undefined);
          trash.reload();
        }}
      >
        <p>
          This removes the house folder, its images, templates, and revision history. It cannot be undone.
        </p>
      </ConfirmPopup>
      <SettingsPopup
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
        }}
      />
      {/* The same quiet link as the Floor Builder's viewport. */}
      <a href="agent.md" target="_blank" rel="noreferrer" data-agent-instructions="">
        AI agent instructions
      </a>
    </div>
  );
};
