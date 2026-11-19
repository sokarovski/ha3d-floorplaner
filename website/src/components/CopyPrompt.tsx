import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../src/design-system/components/Button/Button";
import { Icon } from "../../../src/design-system/components/Icon/Icon";

type CopyPromptProps = Readonly<{
  prompt: string;
}>;

type CopyState = "idle" | "copied" | "failed";

export const CopyPrompt = ({ prompt }: CopyPromptProps): ReactElement => {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") {
      return undefined;
    }
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = (): void => {
    void navigator.clipboard.writeText(prompt).then(
      () => setState("copied"),
      () => setState("failed"),
    );
  };

  return (
    <div data-site-prompt="">
      <p data-site-prompt-label="">Prompt</p>
      <blockquote data-site-prompt-text="">{prompt}</blockquote>
      <div data-site-prompt-actions="">
        <Button variant="secondary" size="sm" onPress={copy}>
          <Icon name={state === "copied" ? "check" : "copy"} size="sm" />
          {state === "copied" ? "Copied" : "Copy prompt"}
        </Button>
        <span data-site-prompt-status="" role="status">
          {state === "failed" ? "Copying is not available here; select the text and copy it instead." : ""}
        </span>
      </div>
    </div>
  );
};
