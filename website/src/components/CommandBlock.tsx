import type { ReactElement } from "react";

type CommandBlockProps = Readonly<{
  label: string;
  lines: readonly string[];
}>;

export const CommandBlock = ({ label, lines }: CommandBlockProps): ReactElement => (
  <pre data-site-code="" aria-label={label} tabIndex={0}>
    <code>{lines.join("\n")}</code>
  </pre>
);
