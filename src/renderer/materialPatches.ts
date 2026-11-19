// Composable material shader patches (framework-free; used by the strip light in stripShading.ts and the HA
// viewer's room cutaway). Three.js has one `onBeforeCompile` and one `customProgramCacheKey` per material, so
// two features assigning them would overwrite each other. Every patch registers here under its own name; the
// material runs all of them in name order and its program key joins their keys, so a program is shared only by
// materials with the same patches and settings.
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";

export type MaterialPatch = Readonly<{
  /** Everything `apply` depends on besides the material itself (it becomes part of the program key). */
  key: () => string;
  /** Edits the shader source and adds uniforms (string replacements of `#include` lines, as onBeforeCompile). */
  apply: (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void;
}>;

const registry = new WeakMap<Material, Map<string, MaterialPatch>>();

/**
 * Adds, replaces (same name) or removes (null) a patch of a material and marks it for recompilation. Patches
 * must keep the `#include` lines they anchor on, so others can anchor on them too.
 */
export const setMaterialPatch = (material: Material, name: string, patch: MaterialPatch | null): void => {
  let patches = registry.get(material);
  if (patches === undefined) {
    if (patch === null) return;
    const own = new Map<string, MaterialPatch>();
    patches = own;
    registry.set(material, own);
    const ordered = (): [string, MaterialPatch][] => [...own].sort(([a], [b]) => a.localeCompare(b));
    material.onBeforeCompile = (shader, renderer) => {
      for (const [, entry] of ordered()) entry.apply(shader, renderer);
    };
    material.customProgramCacheKey = () =>
      ordered()
        .map(([entryName, entry]) => `${entryName}:${entry.key()}`)
        .join("|");
  }
  if (patch === null) patches.delete(name);
  else patches.set(name, patch);
  material.needsUpdate = true;
};

/** True when the material carries the named patch. */
export const hasMaterialPatch = (material: Material, name: string): boolean =>
  registry.get(material)?.has(name) === true;
