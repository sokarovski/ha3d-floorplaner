import type { ReactElement } from "react";
import { Link } from "react-router";
import { catalogProblems, componentDocs } from "../catalog/componentCatalog";
import { Banner } from "../../../design-system/components/Banner/Banner";

export const DsHomePage = (): ReactElement => {
  const problems = catalogProblems(componentDocs);
  return (
    <article data-ds-page="">
      <h1>Homeplan design system</h1>
      <p data-ds-lead="">
        The shared components, tokens, and conventions used by the Houses screen, the Floor Builder, menus,
        panels, and every form. This workbench is unlisted: open it directly at <code>/ds</code>.
      </p>
      {problems.length === 0 ? null : <Banner tone="danger">Catalog problems: {problems.join("; ")}</Banner>}
      <h2>Visual principles</h2>
      <ul data-ds-list="">
        <li>
          A compact, restrained editor interface: neutral surfaces, readable fields, clear selection and
          focus, one accent for actions.
        </li>
        <li>The house viewport is the central content; chrome stays quiet.</li>
        <li>
          Theme changes affect interface chrome and editor helpers only, never house materials or lighting.
        </li>
      </ul>
      <h2>Getting started</h2>
      <ul data-ds-list="">
        <li>
          Import components from <code>src/design-system/components/&lt;Name&gt;/&lt;Name&gt;</code>.
        </li>
        <li>
          Style through <code>data-*</code> attributes in the component&apos;s <code>.tw.css</code>, imported
          once from <code>app.tw.css</code>.
        </li>
        <li>
          Build every form with <code>SchemaForm</code> or <code>FormPopup</code>; every modal is a{" "}
          <code>Popup</code>.
        </li>
      </ul>
      <h2>Component catalog</h2>
      <div data-ds-card-grid="">
        {componentDocs.map((doc) => (
          <Link key={doc.slug} to={`/ds/components/${doc.slug}`} data-ds-card="">
            <span data-ds-card-title="">{doc.name}</span>
            <span data-ds-card-text="">{doc.purpose}</span>
          </Link>
        ))}
      </div>
    </article>
  );
};
