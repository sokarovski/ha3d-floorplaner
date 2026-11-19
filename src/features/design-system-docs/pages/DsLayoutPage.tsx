import type { ReactElement } from "react";
import { Outlet } from "react-router";
import { dsNavigation } from "../catalog/navigation";
import { propertyEditorNavigation } from "../catalog/propertyEditorNavigation";
import { DsSidebar } from "../components/DsSidebar";

export const DsLayoutPage = (): ReactElement => (
  <div data-ds-layout="">
    <DsSidebar sections={dsNavigation(propertyEditorNavigation())} />
    <div data-ds-main="">
      <Outlet />
    </div>
  </div>
);
