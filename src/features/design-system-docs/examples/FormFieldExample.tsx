import { useId, useState } from "react";
import type { ReactElement } from "react";
import { FormField } from "../../../design-system/components/FormField/FormField";
import { Input } from "../../../design-system/components/Input/Input";

export const FormFieldExample = (): ReactElement => {
  const [name, setName] = useState("");
  const id = useId();
  const error = name.trim() === "" ? "A name is required." : undefined;
  return (
    <div data-ds-example-column="">
      <FormField
        label="House name"
        htmlFor={`${id}-name`}
        required
        error={error}
        errorId={`${id}-error`}
        description="Shown on the Houses screen."
      >
        <Input
          id={`${id}-name`}
          value={name}
          onChange={setName}
          invalid={error !== undefined}
          aria-describedby={`${id}-error`}
        />
      </FormField>
      <FormField label="Height" htmlFor={`${id}-h`} layout="inline" hint="= 2500 mm">
        <Input id={`${id}-h`} value="2.5m" onChange={setName} monospace />
      </FormField>
      <FormField label="Top" htmlFor={`${id}-top`} layout="section">
        <Input id={`${id}-top`} value="Terracotta tiles 30 cm" onChange={setName} />
      </FormField>
      <FormField label="Underside" htmlFor={`${id}-under`} layout="section">
        <Input id={`${id}-under`} value="Pale ash planks" onChange={setName} />
      </FormField>
    </div>
  );
};
