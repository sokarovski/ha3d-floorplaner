import type { ReactElement } from "react";
import { CodeBlock } from "../components/CodeBlock";
import buttonSource from "../../../design-system/components/Button/Button.tsx?raw";
import buttonStyles from "../../../design-system/components/Button/button.tw.css?raw";

export const DsConventionsPage = (): ReactElement => (
  <article data-ds-page="">
    <h1>Conventions</h1>
    <h2>Component files</h2>
    <ul data-ds-list="">
      <li>One component per file, a named arrow function, one named export, no default export.</li>
      <li>
        Three sections in order: imports, the <code>&lt;Name&gt;Props</code> type, the exported component. A
        component with no inputs omits the props section.
      </li>
      <li>
        No inline components, no logic at file level: helpers go into a <code>.ts</code> module.
      </li>
      <li>
        No <code>any</code>, no <code>as</code> casts, no non-null <code>!</code>, no <code>@ts-ignore</code>,
        no <code>eslint-disable</code>. ESLint enforces these.
      </li>
    </ul>
    <h2>Styling</h2>
    <ul data-ds-list="">
      <li>
        Components expose identity and variants as <code>data-*</code> attributes: an empty string when a
        modifier applies, <code>undefined</code> when it does not.
      </li>
      <li>
        Each component owns a <code>.tw.css</code> file with attribute selectors and <code>@apply</code> on
        semantic tokens, imported from <code>app.tw.css</code>.
      </li>
      <li>
        No <code>className</code> or inline <code>style</code> in JSX (lint error). React Aria state
        attributes such as <code>data-hovered</code> and <code>data-focus-visible</code> are used as
        selectors.
      </li>
    </ul>
    <h2>Accessibility</h2>
    <ul data-ds-list="">
      <li>
        Behavior comes from React Aria Components: focus management, keyboard navigation, and ARIA roles.
      </li>
      <li>
        Every icon-only control has a label; errors are associated with their fields; color is never the only
        signal.
      </li>
    </ul>
    <h2>Forms</h2>
    <p>
      Every form is a JSON Schema rendered by <code>SchemaForm</code>; popups use <code>FormPopup</code>. See
      the Forms page.
    </p>
    <h2>Example: Button</h2>
    <CodeBlock code={buttonSource} label="Button.tsx" />
    <CodeBlock code={buttonStyles} label="button.tw.css" />
  </article>
);
