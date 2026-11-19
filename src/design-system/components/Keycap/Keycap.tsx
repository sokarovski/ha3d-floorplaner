import type { ReactElement } from "react";

type KeycapProps = Readonly<{
  /** The key or chord as shown, e.g. "⌘K", "Esc". */
  children: string;
  /** What pressing it does, for assistive technology (the cap itself is decorative text). */
  "aria-label"?: string;
}>;

/** A keyboard key, as a hint inside a field or next to an action (Phase 5.8). */
export const Keycap = ({ children, "aria-label": ariaLabel }: KeycapProps): ReactElement => (
  <kbd data-keycap="" aria-label={ariaLabel}>
    {children}
  </kbd>
);
