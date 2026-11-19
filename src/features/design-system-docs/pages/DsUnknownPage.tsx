import type { ReactElement } from "react";
import { useParams } from "react-router";
import { DsNotFound } from "../components/DsNotFound";

export const DsUnknownPage = (): ReactElement => {
  const params = useParams();
  return <DsNotFound what="page" slug={params["*"] ?? ""} />;
};
