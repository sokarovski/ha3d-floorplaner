import type { ReactElement } from "react";
import type { PropDoc } from "../catalog/docTypes";

type PropsTableProps = Readonly<{
  props: readonly PropDoc[];
}>;

export const PropsTable = ({ props }: PropsTableProps): ReactElement => (
  <table data-ds-table="">
    <thead>
      <tr>
        <th scope="col">Prop</th>
        <th scope="col">Type</th>
        <th scope="col">Required</th>
        <th scope="col">Default</th>
        <th scope="col">Behavior</th>
      </tr>
    </thead>
    <tbody>
      {props.map((prop) => (
        <tr key={prop.name}>
          <td>
            <code>{prop.name}</code>
          </td>
          <td>
            <code>{prop.type}</code>
          </td>
          <td>{prop.required ? "Yes" : "No"}</td>
          <td>{prop.defaultValue === undefined ? "—" : <code>{prop.defaultValue}</code>}</td>
          <td>{prop.description}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
