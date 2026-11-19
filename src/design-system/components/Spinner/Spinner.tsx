import type { ReactElement } from "react";

type SpinnerProps = Readonly<{
  label?: string;
}>;

export const Spinner = ({ label = "Loading" }: SpinnerProps): ReactElement => (
  <span data-spinner="" role="status" aria-label={label} />
);
