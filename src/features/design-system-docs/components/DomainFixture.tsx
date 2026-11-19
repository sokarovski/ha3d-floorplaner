import type { ReactElement, ReactNode } from "react";
import { DomainEditorDataContext } from "../../floor-builder/domain-editors/domainEditorData";
import { fixtureDomainData } from "../catalog/domainFixtures";

type DomainFixtureProps = Readonly<{
  children: ReactNode;
}>;

/** Provides fixture house data to domain editors on /ds pages. */
export const DomainFixture = ({ children }: DomainFixtureProps): ReactElement => (
  <DomainEditorDataContext.Provider value={fixtureDomainData}>{children}</DomainEditorDataContext.Provider>
);
