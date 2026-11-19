import type { ReactElement } from "react";
import { Link } from "react-router";
import { DsExample } from "../components/DsExample";
import { MvpFormsExample } from "../examples/MvpFormsExample";
import mvpFormsSource from "../examples/MvpFormsExample.tsx?raw";
import { SchemaFormBufferedExample } from "../examples/SchemaFormBufferedExample";
import bufferedSource from "../examples/SchemaFormBufferedExample.tsx?raw";
import { PopupExample } from "../examples/PopupExample";
import popupSource from "../examples/PopupExample.tsx?raw";
import { PopupCustomFooterExample } from "../examples/PopupCustomFooterExample";
import popupFooterSource from "../examples/PopupCustomFooterExample.tsx?raw";
import formPopupSource from "../../../design-system/forms/FormPopup/FormPopup.tsx?raw";
import formSchemaSource from "../../../../shared/domain/schemas/forms/imageForms.ts?raw";

export const DsFormsPage = (): ReactElement => (
  <article data-ds-page="">
    <h1>Forms and popups</h1>
    <p data-ds-lead="">
      There is one form builder. A form is a values object plus a JSON Schema configuration rendered by{" "}
      <code>SchemaForm</code>: live in the property panel, buffered in <code>FormPopup</code>. No form is
      hand-coded.
    </p>
    <h2>SchemaForm, live mode</h2>
    <p>
      Each committed field calls <code>onCommit(path, value)</code>, which becomes one undoable command. See
      the <Link to="/ds/property-panel">property panel playground</Link>.
    </p>
    <h2>SchemaForm, buffered mode</h2>
    <DsExample
      example={{
        id: "schema-form-buffered",
        title: "Buffered draft (Export PNG schema)",
        Example: SchemaFormBufferedExample,
        source: bufferedSource,
      }}
    />
    <h2>Popup anatomy</h2>
    <p>
      Header with title and close; scrolling body; footer with Cancel/Save or a custom footer. Escape closes
      unless busy; backdrop clicks never close.
    </p>
    <DsExample
      example={{ id: "popup-default", title: "Default footer", Example: PopupExample, source: popupSource }}
    />
    <DsExample
      example={{
        id: "popup-custom",
        title: "Custom footer (confirmation)",
        Example: PopupCustomFooterExample,
        source: popupFooterSource,
      }}
    />
    <h2>FormPopup and every MVP form</h2>
    <p>
      Save validates the whole draft with Ajv; errors land on their fields. A rejected submit keeps the draft;
      server field errors map back by JSON Pointer. Closing a changed form asks “Discard changes?”.
    </p>
    <DsExample
      example={{
        id: "mvp-forms",
        title: "MVP forms with fixture values",
        Example: MvpFormsExample,
        source: mvpFormsSource,
        companions: [
          { label: "FormPopup.tsx", source: formPopupSource },
          { label: "Form schema example (imageForms.ts)", source: formSchemaSource },
        ],
      }}
    />
  </article>
);
