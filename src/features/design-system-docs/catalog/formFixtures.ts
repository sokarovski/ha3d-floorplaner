// Every MVP form with fixture values for /ds/forms.
import { exportPngForm } from "@shared/domain/schemas/forms/exportForms";
import {
  nameUploadedHouseForm,
  newHouseForm,
  renameHouseForm,
  uploadHouseForm,
} from "@shared/domain/schemas/forms/houseForms";
import { renameImageForm, uploadImageForm } from "@shared/domain/schemas/forms/imageForms";
import { createMaterialForm, savePresetForm } from "@shared/domain/schemas/forms/materialForms";
import { importModelForm } from "@shared/domain/schemas/forms/modelForms";
import { saveWithNoteForm } from "@shared/domain/schemas/forms/revisionForms";
import { settingsForm } from "@shared/domain/schemas/forms/settingsForms";
import { defaultPreferences } from "@shared/domain/schemas/preferences";

export const mvpFormFixtures = [
  { id: "new-house", label: "New house", schema: newHouseForm, values: {} },
  { id: "rename-house", label: "Rename house", schema: renameHouseForm, values: { name: "My home" } },
  { id: "upload-house", label: "Upload house", schema: uploadHouseForm, values: {} },
  {
    id: "name-uploaded-house",
    label: "Name the uploaded house",
    schema: nameUploadedHouseForm,
    values: { name: "My home (2)" },
  },
  { id: "upload-image", label: "Upload image", schema: uploadImageForm, values: {} },
  { id: "rename-image", label: "Rename image", schema: renameImageForm, values: { name: "Oak parquet" } },
  { id: "save-preset", label: "Save as preset", schema: savePresetForm, values: {} },
  { id: "create-material", label: "Create material", schema: createMaterialForm, values: {} },
  { id: "save-note", label: "Save with note", schema: saveWithNoteForm, values: {} },
  { id: "export-png", label: "Export PNG", schema: exportPngForm, values: {} },
  { id: "import-model", label: "Import model", schema: importModelForm, values: {} },
  { id: "settings", label: "Settings", schema: settingsForm, values: defaultPreferences },
] as const;
