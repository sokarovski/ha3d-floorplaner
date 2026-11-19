import type { ReactElement, ReactNode } from "react";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { useSaveState, useSession, useUi } from "../hooks/sessionContext";

type StatusBarProps = Readonly<{
  hint?: ReactNode;
}>;

export const StatusBar = ({ hint }: StatusBarProps): ReactElement => {
  const session = useSession();
  const notice = useUi((ui) => ui.notice);
  const saveMessage = useSaveState((save) => save.message);
  return (
    <div data-status-bar="">
      <span data-status-hint="">{hint}</span>
      {saveMessage === undefined ? null : (
        <span data-status-notice="" data-status-tone="danger">
          {saveMessage}
        </span>
      )}
      {notice === undefined ? null : (
        <span data-status-notice="" data-status-tone={notice.tone} role="status">
          {notice.text}
          <IconButton
            icon="close"
            size="sm"
            label="Dismiss"
            onPress={() => {
              session.ui.setState({ notice: undefined });
            }}
          />
        </span>
      )}
    </div>
  );
};
