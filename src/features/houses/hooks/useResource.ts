// A small explicit loading state for one resource read, with abort on unmount and a reload action.
import { useCallback, useEffect, useState } from "react";

export type ResourceState<T> =
  | Readonly<{ status: "loading"; data: T | undefined }>
  | Readonly<{ status: "ready"; data: T }>
  | Readonly<{ status: "error"; data: T | undefined; message: string }>;

export const useResource = <T>(
  load: (signal: AbortSignal) => Promise<T>,
): Readonly<{ state: ResourceState<T>; reload: () => void }> => {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading", data: undefined });
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState((current) => ({
            status: "error",
            data: current.data,
            message: error instanceof Error ? error.message : "Loading failed.",
          }));
      },
    );
    return () => {
      controller.abort();
    };
  }, [load, generation]);
  const reload = useCallback(() => {
    setState((current) => ({ status: "loading", data: current.data }));
    setGeneration((value) => value + 1);
  }, []);
  return { state, reload };
};
