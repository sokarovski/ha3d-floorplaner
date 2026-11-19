// A file-picker field for popup forms. The value is a browser File; Ajv sees an object.
import Type from "typebox";
import { hp } from "../annotations";

export const FileField = (options: {
  title: string;
  accept: readonly string[];
  maxBytes: number;
  order?: number;
}) =>
  Type.Unsafe<File>({
    type: "object",
    title: options.title,
    ...hp({
      editor: "file",
      accept: [...options.accept],
      maxBytes: options.maxBytes,
      ...(options.order === undefined ? {} : { order: options.order }),
    }),
  });
