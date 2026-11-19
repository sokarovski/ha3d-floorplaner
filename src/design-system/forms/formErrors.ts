// Errors a FormPopup submit handler can throw. Field errors are keyed by JSON Pointer into the form values.

export class FormSubmitError extends Error {
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(message: string, fieldErrors: Readonly<Record<string, string>> = {}) {
    super(message);
    this.name = "FormSubmitError";
    this.fieldErrors = fieldErrors;
  }
}

export const describeSubmitError = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong. Try again.";
