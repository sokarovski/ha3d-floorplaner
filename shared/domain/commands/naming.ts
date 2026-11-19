// "Next free" names: EtageN for floors, Area N, Carpet N, template label + N (D14).

export const nextFreeName = (existing: readonly string[], prefix: string, separator = " "): string => {
  const taken = new Set(existing.map((name) => name.trim().toLocaleLowerCase()));
  for (let n = 1; ; n += 1) {
    const candidate = `${prefix}${separator}${String(n)}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
};
