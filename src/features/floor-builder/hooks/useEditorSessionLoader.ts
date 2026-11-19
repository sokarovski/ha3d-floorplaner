// Loads a house document and owns the editor session's lifetime (disposed on house change/unmount).
import { useEffect, useState } from "react";
import { ApiClientError } from "../../../api/apiError";
import type { HouseClient } from "../../../api/houseClient";
import { createEditorSession } from "../services/editorSession";
import type { EditorSession } from "../services/editorSession";

export type SessionLoadState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; session: EditorSession }>
  | Readonly<{ status: "error"; message: string; notFound: boolean }>;

export const useEditorSessionLoader = (
  houseId: string,
  client: HouseClient,
  attempt: number,
): SessionLoadState => {
  const key = `${houseId}#${String(attempt)}`;
  const [loaded, setState] = useState<Readonly<{ key: string; state: SessionLoadState }>>({
    key: "",
    state: { status: "loading" },
  });
  useEffect(() => {
    const controller = new AbortController();
    let session: EditorSession | undefined;
    client.loadDocument(houseId, controller.signal).then(
      (envelope) => {
        if (controller.signal.aborted) return;
        session = createEditorSession(houseId, envelope.document, envelope.revision, client);
        setState({ key, state: { status: "ready", session } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          key,
          state: {
            status: "error",
            message: error instanceof Error ? error.message : "The house could not be opened.",
            notFound: error instanceof ApiClientError && error.category === "notFound",
          },
        });
      },
    );
    return () => {
      controller.abort();
      if (session !== undefined) {
        void session.save.flush();
        session.dispose();
      }
    };
  }, [houseId, client, key]);
  return loaded.key === key ? loaded.state : { status: "loading" };
};
