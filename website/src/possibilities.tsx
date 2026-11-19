import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PossibilitiesApp } from "./components/PossibilitiesApp";
import "./site.tw.css";

const container = document.getElementById("root");
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <PossibilitiesApp />
    </StrictMode>,
  );
}
