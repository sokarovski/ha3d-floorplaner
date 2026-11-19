import type { ReactElement } from "react";
import { Link } from "react-router";
import type { ComponentDoc } from "../catalog/docTypes";
import { DsExample } from "./DsExample";
import { PropsTable } from "./PropsTable";

type DsDocArticleProps = Readonly<{
  doc: ComponentDoc;
  basePath?: string;
}>;

export const DsDocArticle = ({ doc, basePath = "/ds/components" }: DsDocArticleProps): ReactElement => (
  <article data-ds-page="">
    <h1>{doc.name}</h1>
    <p data-ds-lead="">{doc.purpose}</p>
    <p>
      <strong>Import:</strong> <code>{doc.importPath}</code>
    </p>
    <p>
      <strong>When to use:</strong> {doc.whenToUse}
    </p>
    <h2>Examples</h2>
    {doc.examples.map((example) => (
      <DsExample key={example.id} example={example} />
    ))}
    <h2>Props</h2>
    <PropsTable props={doc.props} />
    {doc.keyboard === undefined ? null : (
      <>
        <h2>Keyboard and accessibility</h2>
        <ul data-ds-list="">
          {doc.keyboard.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </>
    )}
    {doc.accessibility === undefined ? null : <p>{doc.accessibility}</p>}
    {doc.related === undefined ? null : (
      <>
        <h2>Related</h2>
        <ul data-ds-list="">
          {doc.related.map((slug) => (
            <li key={slug}>
              <Link to={`${basePath}/${slug}`}>{slug}</Link>
            </li>
          ))}
        </ul>
      </>
    )}
  </article>
);
