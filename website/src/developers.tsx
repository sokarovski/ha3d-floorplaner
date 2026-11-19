import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DevelopersApp } from "./components/DevelopersApp";
import "./site.tw.css";

const container = document.getElementById("root");
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <DevelopersApp />
    </StrictMode>,
  );
}
