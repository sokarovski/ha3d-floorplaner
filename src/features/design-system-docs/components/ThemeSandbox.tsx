import { useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { UNSAFE_PortalProvider } from "react-aria";

type ThemeSandboxProps = Readonly<{
  theme: "light" | "dark";
  children: ReactNode;
}>;

/** A local preview theme. Popups portal inside it, and it never writes the application preference. */
export const ThemeSandbox = ({ theme, children }: ThemeSandboxProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div data-ui-root="" data-theme={theme} data-theme-sandbox="" ref={containerRef}>
      <UNSAFE_PortalProvider getContainer={() => containerRef.current}>{children}</UNSAFE_PortalProvider>
    </div>
  );
};
