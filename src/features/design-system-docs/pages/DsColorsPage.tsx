import type { ReactElement } from "react";
import { colorTokens } from "../../../design-system/tokens/colorTokens";
import { ColorSwatch } from "../components/ColorSwatch";
import { pairings } from "../catalog/colorPairings";
import { ColorPairing } from "../components/ColorPairing";

export const DsColorsPage = (): ReactElement => (
  <article data-ds-page="">
    <h1>Colors</h1>
    <p data-ds-lead="">
      Semantic color roles. Every role has a light and a dark value, defined in <code>tokens.tw.css</code> as{" "}
      <code>--ui-color-&lt;role&gt;</code> and mapped to Tailwind as <code>--color-&lt;role&gt;</code>.
    </p>
    <table data-ds-table="">
      <thead>
        <tr>
          <th scope="col">Role</th>
          <th scope="col">CSS variable</th>
          <th scope="col">Light</th>
          <th scope="col">Dark</th>
          <th scope="col">Current</th>
          <th scope="col">Use</th>
        </tr>
      </thead>
      <tbody>
        {colorTokens.map((token) => (
          <tr key={token.role}>
            <td>{token.role}</td>
            <td>
              <code>--ui-color-{token.role}</code>
            </td>
            <td>
              <ColorSwatch theme="light" role={token.role} /> <code>{token.light}</code>
            </td>
            <td>
              <ColorSwatch theme="dark" role={token.role} /> <code>{token.dark}</code>
            </td>
            <td>
              <ColorSwatch theme="current" role={token.role} />
            </td>
            <td>{token.use}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <h2>Foreground and background pairings</h2>
    <div data-ds-card-grid="">
      {pairings.map((pairing) => (
        <ColorPairing key={pairing.id} pairing={pairing} />
      ))}
    </div>
  </article>
);
