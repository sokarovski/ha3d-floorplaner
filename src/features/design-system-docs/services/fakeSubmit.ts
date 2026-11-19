// Simulated submit for /ds form examples: waits briefly; a name of "taken" fails with a server field error.
import { FormSubmitError } from "../../../design-system/forms/formErrors";

export const fakeSubmit = async (values: unknown): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (typeof values === "object" && values !== null && "name" in values && values.name === "taken") {
    throw new FormSubmitError("The server rejected the form.", {
      "/name": "This name is already used (simulated server error).",
    });
  }
};
