import type { ReactElement } from "react";
import { Link } from "react-router";
import { componentDocs } from "../catalog/componentCatalog";

export const DsComponentsPage = (): ReactElement => (
  <article data-ds-page="">
    <h1>Components</h1>
    <p data-ds-lead="">Every implemented shared component, each with its own page.</p>
    <div data-ds-card-grid="">
      {componentDocs.map((doc) => (
        <Link key={doc.slug} to={`/ds/components/${doc.slug}`} data-ds-card="">
          <span data-ds-card-title="">{doc.name}</span>
          <span data-ds-card-text="">{doc.category}</span>
          <span data-ds-card-text="">{doc.purpose}</span>
        </Link>
      ))}
    </div>
  </article>
);
