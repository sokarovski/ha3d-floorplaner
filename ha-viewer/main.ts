import "./elements";
import { HomeplanPanel } from "./panel";

if (customElements.get("homeplan-panel") === undefined)
  customElements.define("homeplan-panel", HomeplanPanel);
