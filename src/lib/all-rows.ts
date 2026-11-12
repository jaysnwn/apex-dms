// Supabase returns at most 1,000 rows per request and says nothing when it
// stops there: a total added up from such an answer is silently too low.
// allRows() pages through everything, so a list that feeds a total, a count
// or a lookup is always complete. It keeps the { data } shape of a normal
// query and throws on a database error (a wrong total is worse than an error
// screen). Give the query an order on a unique column so pages cannot overlap.
type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export const PAGE_ROWS = 1000;

export async function allRows<T>(make: () => { range: (from: number, to: number) => Page<T> }): Promise<{ data: T[] }> {
  const data: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data: page, error } = await make().range(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    data.push(...(page ?? []));
    if (!page || page.length < PAGE_ROWS) break;
  }
  return { data };
}
