import type { ReactElement } from "react";
import { Link } from "react-router";

type DsNotFoundProps = Readonly<{
  what: string;
  slug: string;
}>;

export const DsNotFound = ({ what, slug }: DsNotFoundProps): ReactElement => (
  <article data-ds-page="">
    <h1>Not found</h1>
    <p>
      There is no {what} named <code>{slug}</code>. <Link to="/ds">Back to the design system</Link>.
    </p>
  </article>
);
