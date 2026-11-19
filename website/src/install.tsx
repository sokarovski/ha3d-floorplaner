import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { InstallApp } from "./components/InstallApp";
import "./site.tw.css";

const container = document.getElementById("root");
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <InstallApp />
    </StrictMode>,
  );
}
