import type { ReactElement } from "react";
import type { RevisionDiffResponseValue } from "@shared/contracts/revisions";
import { summarizeJson } from "../services/diffFormat";

type RevisionDiffViewProps = Readonly<{
  diff: RevisionDiffResponseValue | undefined;
  loading: boolean;
}>;

export const RevisionDiffView = ({ diff, loading }: RevisionDiffViewProps): ReactElement => {
  if (loading) return <p data-history-empty="">Loading changes…</p>;
  if (diff === undefined)
    return <p data-history-empty="">Select a revision to compare it with the current state.</p>;
  if (diff.files.length === 0) return <p data-history-empty="">This revision matches the current state.</p>;
  return (
    <div data-history-diff="">
      {diff.files.map((file) => (
        <section key={file.path} data-history-file="">
          <h3 data-history-file-name="">
            {file.path}{" "}
            <span data-history-file-status="">
              {file.status === "added"
                ? "added since"
                : file.status === "removed"
                  ? "removed since"
                  : "changed"}
            </span>
          </h3>
          {file.changes === undefined ? (
            file.format === "binary" ? (
              <p data-history-empty="">Binary file.</p>
            ) : null
          ) : (
            <table data-history-changes="">
              <thead>
                <tr>
                  <th scope="col">Path</th>
                  <th scope="col">In revision</th>
                  <th scope="col">Now</th>
                </tr>
              </thead>
              <tbody>
                {file.changes.map((change) => (
                  <tr key={`${change.pointer}-${change.kind}`}>
                    <td>
                      <code>{change.pointer === "" ? "/" : change.pointer}</code>
                    </td>
                    <td>{summarizeJson(change.before)}</td>
                    <td>{summarizeJson(change.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {file.truncated === true ? <p data-history-empty="">More changes are not shown.</p> : null}
        </section>
      ))}
    </div>
  );
};
