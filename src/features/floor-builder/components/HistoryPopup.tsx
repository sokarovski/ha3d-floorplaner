import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { RevisionDiffResponseValue, RevisionSummaryValue } from "@shared/contracts/revisions";
import { saveWithNoteForm } from "@shared/domain/schemas/forms/revisionForms";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { FormSubmitError } from "../../../design-system/forms/formErrors";
import { useAppServices } from "../../../app/appServicesContext";
import { ConfirmPopup } from "../../houses/components/ConfirmPopup";
import { useDomainEditorData } from "../domain-editors/domainEditorData";
import { useSession } from "../hooks/sessionContext";
import { formatRevisionTime } from "../services/diffFormat";
import { RevisionDiffView } from "./RevisionDiffView";

type HistoryPopupProps = Readonly<{
  open: boolean;
  onClose: () => void;
}>;

export const HistoryPopup = ({ open, onClose }: HistoryPopupProps): ReactElement => {
  const session = useSession();
  const { houses } = useAppServices();
  const libraries = useDomainEditorData();
  const [revisions, setRevisions] = useState<readonly RevisionSummaryValue[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [diff, setDiff] = useState<RevisionDiffResponseValue | undefined>(undefined);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [restoring, setRestoring] = useState<RevisionSummaryValue | undefined>(undefined);
  const [noting, setNoting] = useState(false);
  const [generation, setGeneration] = useState(0);
  // Only the latest selection's diff is shown: an earlier, slower response is aborted and ignored.
  const diffRequest = useRef<AbortController | undefined>(undefined);

  useEffect(
    () => () => {
      diffRequest.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    houses.listRevisions(session.houseId, undefined, 50, controller.signal).then(
      (page) => {
        setRevisions(page.revisions);
        setNextBefore(page.nextBefore);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "History could not be loaded.");
      },
    );
    return () => {
      controller.abort();
    };
  }, [open, houses, session, generation]);

  const select = (revisionId: string): void => {
    diffRequest.current?.abort();
    const controller = new AbortController();
    diffRequest.current = controller;
    setSelected(revisionId);
    setLoadingDiff(true);
    void session.save.flush().then(() => {
      if (controller.signal.aborted) return;
      void houses.revisionDiff(session.houseId, revisionId, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          setDiff(result);
          setLoadingDiff(false);
        },
        (failure: unknown) => {
          if (controller.signal.aborted) return;
          setLoadingDiff(false);
          setError(failure instanceof Error ? failure.message : "The changes could not be loaded.");
        },
      );
    });
  };

  const loadOlder = (before: string): void => {
    void houses.listRevisions(session.houseId, before).then(
      (page) => {
        setRevisions((current) => [...current, ...page.revisions]);
        setNextBefore(page.nextBefore);
      },
      (failure: unknown) => {
        setError(failure instanceof Error ? failure.message : "Older revisions could not be loaded.");
      },
    );
  };

  return (
    <>
      <Popup
        open={open && restoring === undefined && !noting}
        title="History"
        size="lg"
        onClose={onClose}
        footer={
          <>
            <Button
              variant="secondary"
              onPress={() => {
                setNoting(true);
              }}
            >
              Save with note…
            </Button>
            <Button variant="primary" onPress={onClose}>
              Close
            </Button>
          </>
        }
      >
        {error === undefined ? null : <Banner tone="danger">{error}</Banner>}
        <div data-history="">
          <ul data-history-list="" aria-label="Revisions">
            {revisions.map((revision) => (
              <li
                key={revision.id}
                data-history-item=""
                data-history-selected={revision.id === selected ? "" : undefined}
              >
                <button
                  type="button"
                  data-history-select=""
                  onClick={() => {
                    select(revision.id);
                  }}
                >
                  <span data-history-message="">{revision.message}</span>
                  <span data-history-meta="">
                    {formatRevisionTime(revision.time)} · {revision.changedFiles.length} file
                    {revision.changedFiles.length === 1 ? "" : "s"}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setRestoring(revision);
                  }}
                >
                  Restore…
                </Button>
              </li>
            ))}
            {nextBefore === null ? null : (
              <li>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    loadOlder(nextBefore);
                  }}
                >
                  Load older revisions
                </Button>
              </li>
            )}
          </ul>
          <RevisionDiffView diff={diff} loading={loadingDiff} />
        </div>
      </Popup>
      <ConfirmPopup
        open={restoring !== undefined}
        title="Restore this revision?"
        confirmLabel="Restore"
        danger={false}
        onClose={() => {
          setRestoring(undefined);
        }}
        onConfirm={async () => {
          if (restoring === undefined) return;
          const written = await session.save.flush();
          if (!written)
            throw new Error("The current edits could not be written. Resolve the save problem first.");
          const result = await houses.restoreRevision(
            session.houseId,
            restoring.id,
            session.saves.getState().serverRevision,
          );
          session.replaceDocument(result.document, result.revision);
          libraries.reloadImages();
          session.notify(
            "info",
            `Restored “${restoring.message}” as a new revision. Undo history starts here.`,
          );
          setRestoring(undefined);
          setSelected(undefined);
          setDiff(undefined);
          setGeneration((value) => value + 1);
        }}
      >
        <p>
          The house returns to this revision, including its images. This is saved as a new revision, so later
          revisions stay in the history. Undo cannot step across a restore.
        </p>
      </ConfirmPopup>
      <FormPopup
        open={noting}
        schema={saveWithNoteForm}
        values={{}}
        onCancel={() => {
          setNoting(false);
        }}
        onSubmit={async (values) => {
          if (!(await session.save.saveRevision(values.message)))
            throw new FormSubmitError("The revision could not be saved.");
          setNoting(false);
          setGeneration((value) => value + 1);
        }}
      />
    </>
  );
};
