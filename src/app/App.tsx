import type { ReactElement } from "react";
import { RouterProvider } from "react-router";
import type { AppServices } from "./appServices";
import { AppServicesContext } from "./appServicesContext";
import type { createAppRouter } from "./routes/router";

type AppProps = Readonly<{
  router: ReturnType<typeof createAppRouter>;
  services: AppServices;
}>;

export const App = ({ router, services }: AppProps): ReactElement => (
  <AppServicesContext.Provider value={services}>
    <RouterProvider router={router} />
  </AppServicesContext.Provider>
);
