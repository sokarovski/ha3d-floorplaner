import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import type { ExampleDoc } from "../catalog/docTypes";
import { SourceCodePopup } from "./SourceCodePopup";
import { ThemeSandbox } from "./ThemeSandbox";

type DsExampleProps = Readonly<{
  example: ExampleDoc;
}>;

export const DsExample = ({ example }: DsExampleProps): ReactElement => {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<"app" | "light" | "dark">("app");
  const { Example } = example;

  return (
    <section data-ds-example="" aria-labelledby={`example-${example.id}`}>
      <header data-ds-example-header="">
        <h3 id={`example-${example.id}`}>{example.title}</h3>
        <div data-ds-example-actions="">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              setPreviewTheme(previewTheme === "app" ? "light" : previewTheme === "light" ? "dark" : "app");
            }}
          >
            {previewTheme === "app"
              ? "Preview: app theme"
              : previewTheme === "light"
                ? "Preview: light"
                : "Preview: dark"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              setSourceOpen(true);
            }}
          >
            View source
          </Button>
        </div>
      </header>
      {example.description === undefined ? null : <p data-ds-example-description="">{example.description}</p>}
      {previewTheme === "app" ? (
        <div data-ds-example-stage="">
          <Example />
        </div>
      ) : (
        <ThemeSandbox theme={previewTheme}>
          <div data-ds-example-stage="">
            <Example />
          </div>
        </ThemeSandbox>
      )}
      <SourceCodePopup
        open={sourceOpen}
        title={`${example.title}: source`}
        source={example.source}
        companions={example.companions}
        onClose={() => {
          setSourceOpen(false);
        }}
      />
    </section>
  );
};
