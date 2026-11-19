import type { IconName } from "../../../design-system/components/Icon/icons";

/** Typed list of icon names from the icon path table. */
export const iconNames = (paths: Readonly<Record<IconName, string>>): readonly IconName[] => {
  const names: IconName[] = [];
  for (const name in paths) {
    if (Object.hasOwn(paths, name) && isIconName(name, paths)) names.push(name);
  }
  return names;
};

const isIconName = (name: string, paths: Readonly<Record<IconName, string>>): name is IconName =>
  name in paths;
