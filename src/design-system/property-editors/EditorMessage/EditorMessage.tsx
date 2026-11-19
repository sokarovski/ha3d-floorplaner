import type { ReactElement } from "react";

type EditorMessageProps = Readonly<{
  id?: string;
  message: string | undefined;
}>;

export const EditorMessage = ({ id, message }: EditorMessageProps): ReactElement | null =>
  message === undefined ? null : (
    <div data-editor-message="" id={id} role="alert">
      {message}
    </div>
  );
