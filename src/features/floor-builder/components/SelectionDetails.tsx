import type { ReactElement } from "react";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { useHouse, useUi } from "../hooks/sessionContext";
import { describeIssue, floorGeometryIssues, itemsAboveRoofOf, roofIssuesOf } from "../services/floorIssues";
import { derivedFacts } from "../services/derivedFacts";
import { HouseLibrariesSection } from "./HouseLibrariesSection";
import { LightGroupSection } from "./LightGroupSection";

type SelectionDetailsProps = Readonly<{
  refs: readonly EntityRef[];
}>;

export const SelectionDetails = ({ refs }: SelectionDetailsProps): ReactElement => {
  const house = useHouse((value) => value);
  const floorId = useUi((ui) => ui.activeFloorId);
  const ids = new Set(refs.map((ref) => ref.id));
  const issues = floorGeometryIssues(house, floorId).filter((issue) =>
    issue.kind === "openingConflict"
      ? issue.openingIds.some((id) => ids.has(id))
      : issue.kind === "ambiguousOwnership"
        ? issue.wallIds.some((id) => ids.has(id))
        : issue.kind === "orphanWall" || issue.kind === "intrusion"
          ? ids.has(issue.wallId)
          : issue.kind === "reliefDoesNotFit" ||
              issue.kind === "reliefOnCurvedWall" ||
              issue.kind === "reliefTooDeep"
            ? ids.has(issue.reliefId)
            : ids.has(issue.openingId),
  );
  const above = itemsAboveRoofOf(house, floorId).filter((id) => ids.has(id));
  // Holes and roof windows that no longer fit (Phase 19.3), on any floor's roof.
  const roofItems = house.floors.flatMap((floor) =>
    roofIssuesOf(house, floor.id).filter((issue) => ids.has(issue.id) || ids.has(issue.roofId)),
  );
  const facts = refs.length === 1 && refs[0] !== undefined ? derivedFacts(refs[0], house.units, house) : [];
  return (
    <div data-selection-details="">
      {issues.map((issue, index) => (
        <Banner key={`${issue.kind}-${String(index)}`} tone="warning">
          {describeIssue(issue)}
        </Banner>
      ))}
      {roofItems.map((issue) => (
        <Banner key={issue.id} tone="warning">
          {issue.message}
        </Banner>
      ))}
      {above.length === 0 ? null : (
        <Banner tone="warning">This reaches above the roof. Lower it, move it, or raise the roof.</Banner>
      )}
      {facts.length === 0 ? null : (
        <dl data-selection-facts="">
          {facts.map((fact) => (
            <div key={fact.label} data-selection-fact="">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {refs.length === 1 && refs[0]?.kind === "house" ? <HouseLibrariesSection /> : null}
      {refs.length === 1 && refs[0]?.kind === "lightGroup" ? (
        <LightGroupSection floorId={refs[0].floorId} group={refs[0].value} />
      ) : null}
    </div>
  );
};
