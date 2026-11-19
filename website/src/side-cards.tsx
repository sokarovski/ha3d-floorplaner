import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SideCardsApp } from "./components/SideCardsApp";
import "./site.tw.css";

const container = document.getElementById("root");
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <SideCardsApp />
    </StrictMode>,
  );
}
