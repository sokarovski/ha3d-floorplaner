import type { ReactElement } from "react";

type CodeBlockProps = Readonly<{
  code: string;
  label?: string;
}>;

export const CodeBlock = ({ code, label }: CodeBlockProps): ReactElement => (
  <figure data-code-block="">
    {label === undefined ? null : <figcaption data-code-block-label="">{label}</figcaption>}
    <pre data-code-block-pre="" tabIndex={0}>
      <code>{code}</code>
    </pre>
  </figure>
);
