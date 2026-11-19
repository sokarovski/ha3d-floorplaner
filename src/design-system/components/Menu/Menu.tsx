import type { ReactElement, ReactNode } from "react";
import { Menu as AriaMenu } from "react-aria-components";
import type { Key } from "react-aria-components";

type MenuProps = Readonly<{
  label: string;
  children: ReactNode;
  onAction: (id: string) => void;
}>;

export const Menu = ({ label, children, onAction }: MenuProps): ReactElement => (
  <AriaMenu
    aria-label={label}
    data-menu=""
    onAction={(key: Key) => {
      onAction(String(key));
    }}
  >
    {children}
  </AriaMenu>
);
