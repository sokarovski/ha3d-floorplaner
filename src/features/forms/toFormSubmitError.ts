// Maps API failures to errors FormPopup understands: 400 field errors land on their fields.
import { ApiClientError } from "../../api/apiError";
import { FormSubmitError } from "../../design-system/forms/formErrors";

export const toFormSubmitError = (error: unknown): FormSubmitError => {
  if (error instanceof ApiClientError) {
    const fieldErrors = error.category === "validation" ? error.fieldErrors() : {};
    return new FormSubmitError(error.message, fieldErrors);
  }
  return new FormSubmitError(error instanceof Error ? error.message : "Something went wrong. Try again.");
};

/** Runs a submit and rethrows failures as FormSubmitError. */
export const submitWithFormErrors = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (error: unknown) {
    throw toFormSubmitError(error);
  }
};
