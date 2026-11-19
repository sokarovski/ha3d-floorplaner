import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { mvpFormFixtures } from "../catalog/formFixtures";
import { fakeSubmit } from "../services/fakeSubmit";

export const MvpFormsExample = (): ReactElement => {
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [result, setResult] = useState(
    "Open a form. Submitting is simulated; a name of “taken” returns a server field error.",
  );
  const close = (): void => {
    setOpenId(undefined);
  };
  return (
    <div data-ds-example-column="">
      <div data-ds-button-row="">
        {mvpFormFixtures.map((fixture) => (
          <Button
            key={fixture.id}
            variant="secondary"
            onPress={() => {
              setOpenId(fixture.id);
            }}
          >
            {fixture.label}
          </Button>
        ))}
      </div>
      <p>{result}</p>
      {mvpFormFixtures.map((fixture) => (
        <FormPopup
          key={fixture.id}
          open={openId === fixture.id}
          schema={fixture.schema}
          values={fixture.values}
          onCancel={close}
          onSubmit={async (values) => {
            await fakeSubmit(values);
            setResult(
              `${fixture.label} submitted: ${JSON.stringify(values, (_key, value: unknown) => (value instanceof File ? `File(${value.name})` : value))}`,
            );
            close();
          }}
        />
      ))}
    </div>
  );
};
