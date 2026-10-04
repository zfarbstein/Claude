/** Throws a readable Error for a failed Supabase call, or returns its data. */
export function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

/** Reads every row of a query in pages (the API returns at most 1,000 rows per request). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const size = 1000
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const rows = unwrap(await page(from, from + size - 1))
    out.push(...rows)
    if (rows.length < size) return out
  }
}
