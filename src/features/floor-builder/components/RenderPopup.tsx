import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { ReactElement } from "react";
import type { RenderJobResponseValue } from "@shared/contracts/renders";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { Spinner } from "../../../design-system/components/Spinner/Spinner";
import { useAppServices } from "../../../app/appServicesContext";
import { useSession } from "../hooks/sessionContext";
import { useViewportRef } from "../hooks/viewportRef";
import { renderSnapshot } from "../services/renderSnapshot";

type RenderPopupProps = Readonly<{
  open: boolean;
  onClose: () => void;
}>;

export const RenderPopup = ({ open, onClose }: RenderPopupProps): ReactElement => {
  const session = useSession();
  const services = useAppServices();
  const viewport = useViewportRef();
  const [job, setJob] = useState<RenderJobResponseValue | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [submittedGeneration, setSubmittedGeneration] = useState(0);
  const generation = useStore(session.documents, (state) => state.generation);
  const jobId = job?.id;
  const finished =
    job !== undefined && (job.status === "completed" || job.status === "failed" || job.status === "canceled");

  useEffect(() => {
    if (jobId === undefined || finished) return undefined;
    const timer = setInterval(() => {
      services.renders.job(session.houseId, jobId).then(setJob, () => undefined);
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [jobId, finished, services, session]);

  const start = async (): Promise<void> => {
    const runtime = viewport.current;
    if (runtime === null) return;
    setStarting(true);
    setError(undefined);
    try {
      if (!(await session.save.flush())) throw new Error("The house must be written before rendering.");
      const scene = await runtime.exportRenderScene();
      const house = session.documents.getState().document;
      setSubmittedGeneration(session.documents.getState().generation);
      const id = await services.renders.submit(
        session.houseId,
        scene.glb,
        renderSnapshot(
          house,
          session.saves.getState().serverRevision,
          session.ui.getState().activeFloorId,
          scene,
        ),
      );
      setJob(await services.renders.job(session.houseId, id));
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "The render could not be started.");
    } finally {
      setStarting(false);
    }
  };

  const stale = job?.status === "completed" && generation !== submittedGeneration;
  const resultUrl =
    job?.resultExportId === null || job?.resultExportId === undefined
      ? undefined
      : services.exports.fileUrl(session.houseId, job.resultExportId, "final.png");

  return (
    <Popup
      open={open}
      title="Photorealistic render"
      size="lg"
      onClose={onClose}
      footer={
        <>
          {job !== undefined && !finished ? (
            <Button
              variant="secondary"
              onPress={() => {
                void services.renders
                  .cancel(session.houseId, job.id)
                  .then(() => services.renders.job(session.houseId, job.id))
                  .then(setJob);
              }}
            >
              Cancel render
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={starting || (job !== undefined && !finished)}
            busy={starting}
            onPress={() => {
              void start();
            }}
          >
            {job === undefined ? "Render this view" : "Render again"}
          </Button>
          <Button onPress={onClose}>Return to editor</Button>
        </>
      }
    >
      {error === undefined ? null : <Banner tone="danger">{error}</Banner>}
      {job === undefined ? (
        <p>
          Renders the current floor from the current camera with its materials, lights, and sun on the backend
          (Blender/Cycles). Editing stays available; the render uses a frozen snapshot.
        </p>
      ) : job.status === "completed" && resultUrl !== undefined ? (
        <figure data-render-result="">
          {stale ? <Banner tone="warning">This render is older than your current edits.</Banner> : null}
          <img src={resultUrl} alt="Photorealistic render of the floor" data-render-image="" />
          <figcaption>
            <a href={resultUrl} download>
              Download PNG
            </a>{" "}
            · saved to the project&apos;s exports
          </figcaption>
        </figure>
      ) : job.status === "failed" || job.status === "canceled" ? (
        <Banner tone={job.status === "failed" ? "danger" : "info"}>
          {job.status === "failed"
            ? `The render failed: ${job.error ?? "unknown error"}`
            : "The render was cancelled."}
        </Banner>
      ) : (
        <div data-render-progress="">
          <Spinner label="Rendering" />
          <span>
            {job.status === "pending"
              ? "Waiting for the renderer…"
              : `${job.stage} · ${String(Math.round(job.progress * 100))}%`}
          </span>
          <progress max={1} value={job.progress} />
        </div>
      )}
    </Popup>
  );
};
