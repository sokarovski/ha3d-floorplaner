import type { ReactElement } from "react";
import { useParams } from "react-router";
import { findDomainEditorDoc } from "../catalog/domainEditorLookup";
import { findPropertyEditorDoc } from "../catalog/propertyEditorCatalog";
import { CodeBlock } from "../components/CodeBlock";
import { DsDocArticle } from "../components/DsDocArticle";
import { DsNotFound } from "../components/DsNotFound";

export const DsPropertyEditorPage = (): ReactElement => {
  const { editorSlug = "" } = useParams();
  const doc = findPropertyEditorDoc(editorSlug) ?? findDomainEditorDoc(editorSlug);
  if (doc === undefined) return <DsNotFound what="property editor" slug={editorSlug} />;
  return (
    <>
      <DsDocArticle doc={doc} basePath="/ds/property-editors" />
      <article data-ds-page="">
        <h2>Commit and Escape</h2>
        <p>{doc.commitBehavior}</p>
        <h2>Schema that selects it</h2>
        <CodeBlock code={doc.schemaSnippet} label="JSON Schema (emitted by TypeBox)" />
      </article>
    </>
  );
};
