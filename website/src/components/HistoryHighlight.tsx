import type { ReactElement } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import { Section } from "./Section";

export const HistoryHighlight = (): ReactElement => (
  <Section
    id="history"
    title="Your home, with a history."
    tone="surface"
    lead="Every house has its own Git-backed version history. Save a version, compare what changed, and restore an earlier design when you need it, all from Homeplan, without learning Git."
  >
    <ul data-site-checklist="">
      <li>
        <Icon name="save" />
        <span>
          <strong>Save records a version.</strong> Each explicit Save creates a revision of the house, its
          images and its own furniture templates. Saving an unchanged house adds nothing.
        </span>
      </li>
      <li>
        <Icon name="history" />
        <span>
          <strong>Compare and restore.</strong> The History panel lists saved versions and shows what changed.
          Restoring an earlier design is recorded as a new version, so later history is kept.
        </span>
      </li>
      <li>
        <Icon name="check" />
        <span>
          <strong>Nothing extra to install.</strong> Git is built in. You do not need the Git command line or
          a GitHub account to version your houses.
        </span>
      </li>
      <li>
        <Icon name="folder" />
        <span>
          <strong>Local, by design.</strong> The history lives with the house on your own storage. It is not a
          cloud backup; to keep a copy elsewhere, copy the house folder.
        </span>
      </li>
    </ul>
    <p data-site-note="">
      Automatic working saves protect your current edits between Saves without creating versions, and
      Undo/Redo is a separate editing history.
    </p>
  </Section>
);
