// Application composition: runtime config, services, router, and the React root.
import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAppServices } from "./appServices";
import { App } from "./App";
import { createAppRouter } from "./routes/router";
import { loadRuntimeConfig } from "./runtimeConfig";

export const bootstrap = (): void => {
  const container = document.getElementById("root");
  if (container === null) {
    throw new Error("Missing #root element in index.html");
  }
  const config = loadRuntimeConfig();
  const services = createAppServices(config);
  services.preferences.start();
  const router = createAppRouter(config);
  createRoot(container).render(createElement(StrictMode, null, createElement(App, { router, services })));
};
