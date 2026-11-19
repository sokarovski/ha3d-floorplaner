import type { ReactElement } from "react";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";

export const IconButtonExample = (): ReactElement => (
  <>
    <IconButton icon="search" label="Frame selection" />
    <IconButton icon="plus" label="Add" variant="secondary" />
    <IconButton icon="trash" label="Delete" variant="danger" />
    <IconButton icon="close" label="Close" size="sm" />
    <IconButton icon="undo" label="Undo" disabled />
  </>
);
