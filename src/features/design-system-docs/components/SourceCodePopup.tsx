import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { copyText } from "../services/clipboard";
import { CodeBlock } from "./CodeBlock";

type SourceCodePopupProps = Readonly<{
  open: boolean;
  title: string;
  source: string;
  explanation?: string;
  companions?: readonly Readonly<{ label: string; source: string }>[];
  onClose: () => void;
}>;

export const SourceCodePopup = ({
  open,
  title,
  source,
  explanation,
  companions = [],
  onClose,
}: SourceCodePopupProps): ReactElement => {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    void copyText(source).then((ok) => {
      setCopied(ok);
    });
  };

  return (
    <Popup
      open={open}
      title={title}
      size="lg"
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      footer={
        <>
          <span data-source-popup-feedback="" role="status">
            {copied ? "Copied to clipboard" : ""}
          </span>
          <Button variant="secondary" onPress={copy}>
            Copy
          </Button>
          <Button
            variant="primary"
            onPress={() => {
              setCopied(false);
              onClose();
            }}
          >
            Close
          </Button>
        </>
      }
    >
      {explanation === undefined ? null : <p data-source-popup-explanation="">{explanation}</p>}
      <CodeBlock code={source} label="Usage" />
      {companions.map((companion) => (
        <CodeBlock key={companion.label} code={companion.source} label={companion.label} />
      ))}
    </Popup>
  );
};
