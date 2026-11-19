// Shared raw-draft behavior for text-entry editors: keep the draft while typing, commit on Enter or blur,
// revert on Escape, and keep invalid input in the field with a message.
import { useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";

export type DraftParse<T> = (
  text: string,
) => Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; message: string }>;

export type DraftField = Readonly<{
  text: string;
  editing: boolean;
  message: string | undefined;
  setText: (text: string) => void;
  onFocus: () => void;
  onBlur: (event: FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}>;

export const useDraftField = <T>(
  committedText: string,
  parse: DraftParse<T>,
  commit: (value: T) => boolean,
): DraftField => {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const tryCommit = (): boolean => {
    if (draft === undefined) return true;
    if (draft === committedText) {
      setDraft(undefined);
      setMessage(undefined);
      return true;
    }
    const parsed = parse(draft);
    if (!parsed.ok) {
      setMessage(parsed.message);
      return false;
    }
    if (commit(parsed.value)) {
      setDraft(undefined);
      setMessage(undefined);
      return true;
    }
    return false;
  };

  return {
    text: draft ?? committedText,
    editing: draft !== undefined,
    message,
    setText: (text) => {
      setDraft(text);
      setMessage(undefined);
    },
    onFocus: () => undefined,
    onBlur: () => {
      tryCommit();
    },
    onKeyDown: (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        tryCommit();
      } else if (event.key === "Escape") {
        if (draft !== undefined) {
          event.preventDefault();
          event.stopPropagation();
        }
        setDraft(undefined);
        setMessage(undefined);
      }
    },
  };
};
