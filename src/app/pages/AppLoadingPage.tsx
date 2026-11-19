import type { ReactElement } from "react";
import { Spinner } from "../../design-system/components/Spinner/Spinner";

export const AppLoadingPage = (): ReactElement => (
  <div data-app-loading="">
    <Spinner label="Loading Homeplan" />
  </div>
);
