import { domainEditorDocs } from "./domainEditorCatalog";
import type { PropertyEditorDoc } from "./propertyEditorCatalog";

export const findDomainEditorDoc = (slug: string): PropertyEditorDoc | undefined =>
  domainEditorDocs.find((doc) => doc.slug === slug);
