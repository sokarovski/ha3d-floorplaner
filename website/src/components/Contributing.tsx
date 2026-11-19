import type { ReactElement } from "react";
import { links } from "../content/links";
import { CommandBlock } from "./CommandBlock";
import { Section } from "./Section";

// How to contribute: issues first, then a pull request that keeps the checks and the specification in step.
export const Contributing = (): ReactElement => (
  <Section
    id="contribute"
    title="Contribute"
    tone="surface"
    lead="Bug reports, ideas, furniture and fixes are all welcome. Everything happens in the ha3d-floorplaner repository."
  >
    <div data-site-roomy="">
      <ol data-site-steps="">
        <li>
          <strong>Start with an issue.</strong> <a href={links.issues}>Open an issue</a> for a bug, or to talk
          about a bigger change before you build it. The ha3d repository is generated from this one, so
          changes and issues for the integration belong here too.
        </li>
        <li>
          <strong>Read how the project is organised.</strong> The{" "}
          <a href={links.specification}>specification</a> describes every feature and decision, and{" "}
          <a href={links.agentsGuide}>AGENTS.md</a> lists the conventions: TypeScript without <code>any</code>
          , casts or suppressions, forms built from schemas, and styling through data attributes.
        </li>
        <li>
          <strong>Make the change on a branch of your fork.</strong> When a change alters a shared contract,
          update its specification in the same change.
        </li>
        <li>
          <strong>Run the checks.</strong> These must pass with no suppressions; run the feature's own check
          too (the <a href={links.readme}>README</a> lists them, for example{" "}
          <code>npm run geometry:walls</code>
          ).
          <CommandBlock
            label="Checks to run before a pull request"
            lines={["npm run lint", "npm run typecheck", "npm run format:check"]}
          />
        </li>
        <li>
          <strong>Open a pull request</strong> against <code>main</code> of{" "}
          <a href={links.appRepository}>ha3d-floorplaner</a>, saying what changed and how you checked it.
        </li>
      </ol>
      <p data-site-note="">
        Homeplan is released under the <a href={links.licence}>MIT licence</a>; contributions are published
        under it too.
      </p>
    </div>
  </Section>
);
