// The template families built by scripts/build-templates.ts. Each module exports `templates`; adding a
// family is one import and one entry here. `--only <family>` builds one family without touching the
// others' output folders.
import { templates as appliances } from "./appliances";
import { templates as bathroom } from "./bathroom";
import { templates as beds } from "./beds";
import { templates as decor } from "./decor";
import { templates as electronics } from "./electronics";
import { templates as fences } from "./fences";
import { templates as heating } from "./heating";
import type { TemplateSpec } from "./helpers";
import { templates as kitchen } from "./kitchen";
import { templates as lights } from "./lights";
import { templates as openings } from "./openings";
import { templates as outdoor } from "./outdoor";
import { templates as plants } from "./plants";
import { templates as roofWindows } from "./roofWindows";
import { templates as playground } from "./playground";
import { templates as seating } from "./seating";
import { templates as stairs } from "./stairs";
import { templates as storage } from "./storage";
import { templates as tables } from "./tables";

/** Shipped built-in families, written to server/builtin-templates/<id>/. */
export const families: Readonly<Record<string, readonly TemplateSpec[]>> = {
  openings,
  seating,
  tables,
  beds,
  electronics,
  decor,
  plants,
  appliances,
  bathroom,
  lights,
  stairs,
  storage,
  kitchen,
  heating,
  outdoor,
  fences,
  roofWindows,
};

/** Dev-only fixture families, written as single GLBs to src/features/viewport/fixtures/<id>.glb. */
export const fixtureFamilies: Readonly<Record<string, readonly TemplateSpec[]>> = { playground };
