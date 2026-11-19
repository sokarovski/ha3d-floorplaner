import type { ReactElement } from "react";
import { Link } from "react-router";
import { domainEditorDocs } from "../catalog/domainEditorCatalog";
import { propertyEditorDocs } from "../catalog/propertyEditorCatalog";
import { CodeBlock } from "../components/CodeBlock";
import contractSource from "../../../design-system/property-editors/editorContract.ts?raw";
import annotationSource from "../../../../shared/domain/schemas/annotations.ts?raw";

export const DsPropertyEditorsPage = (): ReactElement => (
  <article data-ds-page="">
    <h1>Property editors</h1>
    <p data-ds-lead="">
      Every editable value is rendered by a registered property editor chosen from its JSON Schema node: the
      declared <code>x-homeplan.editor</code>, or a default from the schema type.
    </p>
    <h2>Contract</h2>
    <ul data-ds-list="">
      <li>
        Editors receive the schema node, value, owner object, project unit, disabled, mixed, required, and
        error.
      </li>
      <li>
        They keep their own raw draft: Enter or blur commits, Escape reverts, invalid input stays in the
        field.
      </li>
      <li>
        <code>onPreview</code> is optional (slider drags); <code>onCommit</code> returns false to keep the
        draft when a commit is rejected.
      </li>
    </ul>
    <CodeBlock code={contractSource} label="editorContract.ts" />
    <h2>Default editor by schema</h2>
    <table data-ds-table="">
      <thead>
        <tr>
          <th scope="col">Schema</th>
          <th scope="col">Editor</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <code>x-homeplan.editor</code> set
          </td>
          <td>that editor</td>
        </tr>
        <tr>
          <td>
            <code>readOnly: true</code>
          </td>
          <td>readOnly</td>
        </tr>
        <tr>
          <td>anyOf/oneOf of consts, or enum</td>
          <td>select</td>
        </tr>
        <tr>
          <td>
            <code>quantity: length</code> / <code>angle</code>
          </td>
          <td>length / angle</td>
        </tr>
        <tr>
          <td>boolean</td>
          <td>toggle</td>
        </tr>
        <tr>
          <td>number / integer</td>
          <td>number</td>
        </tr>
        <tr>
          <td>
            string (<code>format: date-time</code>)
          </td>
          <td>text (dateTime)</td>
        </tr>
        <tr>
          <td>array of enumerated items</td>
          <td>multiSelect</td>
        </tr>
        <tr>
          <td>object with properties</td>
          <td>nested group</td>
        </tr>
      </tbody>
    </table>
    <h2>Registry</h2>
    <div data-ds-card-grid="">
      {[...propertyEditorDocs, ...domainEditorDocs].map((doc) => (
        <Link key={doc.slug} to={`/ds/property-editors/${doc.slug}`} data-ds-card="">
          <span data-ds-card-title="">{doc.editor}</span>
          <span data-ds-card-text="">{doc.name}</span>
          <span data-ds-card-text="">{doc.purpose}</span>
        </Link>
      ))}
    </div>
    <h2>The x-homeplan annotation</h2>
    <CodeBlock code={annotationSource} label="shared/domain/schemas/annotations.ts" />
  </article>
);
