import { useState } from "react";
import type { ReactElement } from "react";
import { Icon } from "../../../design-system/components/Icon/Icon";
import { Input } from "../../../design-system/components/Input/Input";
import { Keycap } from "../../../design-system/components/Keycap/Keycap";

export const InputExample = (): ReactElement => {
  const [value, setValue] = useState("Living room");
  return (
    <>
      <Input aria-label="Name" value={value} onChange={setValue} />
      <Input aria-label="Width" value="4525" onChange={setValue} monospace align="end" suffix="mm" />
      <Input aria-label="Invalid" value="abc" onChange={setValue} invalid />
      <Input aria-label="Disabled" value="Read only" onChange={setValue} disabled />
      <Input
        aria-label="Position X"
        value="1200"
        onChange={setValue}
        monospace
        align="end"
        suffix="mm"
        start={<span data-axis="x">X</span>}
      />
      <Input
        aria-label="Width"
        value="4525"
        onChange={setValue}
        monospace
        align="end"
        suffix="mm"
        start="W"
      />
      <Input
        aria-label="Find a room"
        type="search"
        placeholder="Find a room"
        value=""
        onChange={setValue}
        start={<Icon name="search" size="sm" />}
        end={<Keycap>⌘K</Keycap>}
      />
    </>
  );
};
