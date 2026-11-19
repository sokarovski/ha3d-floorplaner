import type { ReactElement } from "react";
import { Section } from "./Section";

export const ProjectAim = (): ReactElement => (
  <Section
    id="aim"
    title="What it is aimed at"
    lead="Homeplan aims to make a smart home easier to understand through the home itself: its floors, rooms, lights and everyday objects."
  >
    <div data-site-grid="" data-site-grid-3="">
      <div data-site-prose="">
        <h3>A home interface organised around real rooms</h3>
        <p>
          Instead of long lists of entities, you find a device where it is in your home, and see at a glance
          which lights are on and where.
        </p>
      </div>
      <div data-site-prose="">
        <h3>A model that grows with the home</h3>
        <p>
          The same model keeps working as you rearrange, renovate or add devices. Edit it, save a new version,
          and upgrade the copy in Home Assistant.
        </p>
      </div>
      <div data-site-prose="">
        <h3>Who it is for</h3>
        <p>
          Home Assistant users who want to see and control their home through a recognisable floor plan, and
          anyone who wants to draw and furnish a measured 3D home. It is not professional CAD. Development is
          ongoing.
        </p>
      </div>
    </div>
  </Section>
);
