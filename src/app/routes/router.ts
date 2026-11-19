// The one explicit route tree (React Router Data Mode). Pages are lazy modules.
import { createBrowserRouter } from "react-router";
import { AppLoadingPage } from "../pages/AppLoadingPage";
import type { RuntimeConfig } from "../runtimeConfig";
import { designSystemRoutes } from "./designSystemRoutes";
import { houseRoutes } from "./houseRoutes";

export const createAppRouter = (config: RuntimeConfig): ReturnType<typeof createBrowserRouter> =>
  createBrowserRouter(
    [
      {
        id: "root",
        HydrateFallback: AppLoadingPage,
        children: [
          ...houseRoutes,
          designSystemRoutes,
          {
            path: "*",
            lazy: async () => ({
              Component: (await import("../../features/not-found/pages/NotFoundPage")).NotFoundPage,
            }),
          },
        ],
      },
    ],
    { basename: config.routerBasename },
  );
