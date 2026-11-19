import type { ReactElement } from "react";
import { useParams } from "react-router";
import { findComponentDoc } from "../catalog/componentCatalog";
import { DsDocArticle } from "../components/DsDocArticle";
import { DsNotFound } from "../components/DsNotFound";

export const DsComponentPage = (): ReactElement => {
  const { componentSlug = "" } = useParams();
  const doc = findComponentDoc(componentSlug);
  return doc === undefined ? (
    <DsNotFound what="component" slug={componentSlug} />
  ) : (
    <DsDocArticle doc={doc} />
  );
};
