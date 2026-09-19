export function matchesQuery(
  query: string,
  ...fields: Array<string | number | null | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) =>
    f == null ? false : String(f).toLowerCase().includes(q),
  );
}
