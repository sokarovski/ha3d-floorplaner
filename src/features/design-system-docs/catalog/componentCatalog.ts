// The /ds component registry: explicit slugs, imported examples, and build-time source.
import type { ComponentDoc } from "./docTypes";
import { editorMessageDoc } from "./components/editor-message";
import { lengthInputDoc } from "./components/length-input";
import { quickPicksDoc } from "./components/quick-picks";
import { swatchPickerDoc } from "./components/swatch-picker";
import { discardChangesPopupDoc } from "./components/discard-changes-popup";
import { propertyGroupDoc } from "./components/property-group";
import { propertyPanelDoc } from "./components/property-panel";
import { formPopupDoc } from "./components/form-popup";
import { schemaFormDoc } from "./components/schema-form";
import { buttonDoc } from "./components/button";
import { iconButtonDoc } from "./components/icon-button";
import { iconDoc } from "./components/icon";
import { inputDoc } from "./components/input";
import { keycapDoc } from "./components/keycap";
import { formFieldDoc } from "./components/form-field";
import { panelDoc } from "./components/panel";
import { bannerDoc } from "./components/banner";
import { spinnerDoc } from "./components/spinner";
import { popupDoc } from "./components/popup";
import { menuDoc } from "./components/menu";
import { menuItemDoc } from "./components/menu-item";
import { menuButtonDoc } from "./components/menu-button";
import { iconSelectMenuDoc } from "./components/icon-select-menu";
import { treeDoc } from "./components/tree";
import { treeItemDoc } from "./components/tree-item";
import { tooltipDoc } from "./components/tooltip";
import { toolboxDoc } from "./components/toolbox";
import { toolButtonDoc } from "./components/tool-button";
import { editorLayoutDoc } from "./components/editor-layout";
import { viewGizmoDoc } from "./components/view-gizmo";

const docs: readonly ComponentDoc[] = [
  editorMessageDoc,
  lengthInputDoc,
  quickPicksDoc,
  swatchPickerDoc,
  discardChangesPopupDoc,
  propertyGroupDoc,
  propertyPanelDoc,
  formPopupDoc,
  schemaFormDoc,
  buttonDoc,
  iconButtonDoc,
  iconDoc,
  inputDoc,
  keycapDoc,
  formFieldDoc,
  panelDoc,
  bannerDoc,
  spinnerDoc,
  popupDoc,
  menuDoc,
  menuItemDoc,
  menuButtonDoc,
  iconSelectMenuDoc,
  treeDoc,
  treeItemDoc,
  tooltipDoc,
  toolboxDoc,
  toolButtonDoc,
  editorLayoutDoc,
  viewGizmoDoc,
];

export const componentDocs: readonly ComponentDoc[] = docs;

export const findComponentDoc = (slug: string): ComponentDoc | undefined =>
  componentDocs.find((doc) => doc.slug === slug);

/** Registry validation: duplicate slugs or examples without source are reported during development. */
export const catalogProblems = (all: readonly ComponentDoc[]): readonly string[] => {
  const problems: string[] = [];
  const slugs = new Set<string>();
  for (const doc of all) {
    if (slugs.has(doc.slug)) problems.push(`Duplicate slug ${doc.slug}`);
    slugs.add(doc.slug);
    if (doc.examples.length === 0) problems.push(`${doc.name} has no examples`);
    for (const example of doc.examples)
      if (example.source.trim() === "") problems.push(`${doc.name}: example ${example.id} has no source`);
    for (const related of doc.related ?? [])
      if (!all.some((other) => other.slug === related))
        problems.push(`${doc.name}: unknown related slug ${related}`);
  }
  return problems;
};
