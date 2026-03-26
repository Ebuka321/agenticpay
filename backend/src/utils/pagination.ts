export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  pageCount: number;
}

/**
 * Parses query parameters into safe pagination values.
 * Defaults: page=1, limit=50. Constraints: page>=1, 1<=limit<=500.
 *
 * @param page - Page number from query (string or number)
 * @param limit - Items per page from query (string or number)
 * @returns Safe pagination parameters with computed offset
 */
export function parsePaginationParams(
  page?: string | number,
  limit?: string | number
): PaginationParams {
  const pageNum = Math.max(1, parseInt(String(page) || '1', 10));
  const limitNum = Math.min(Math.max(1, parseInt(String(limit) || '50', 10)), 500);
  const offset = (pageNum - 1) * limitNum;

  return {
    page: pageNum,
    limit: limitNum,
    offset,
  };
}

/**
 * Creates a standardized paginated response envelope.
 *
 * @param data - Array of items for current page (generic type T)
 * @param total - Total item count across all pages
 * @param page - Current page number
 * @param limit - Items per page
 * @returns Complete paginated result object with metadata
 * @template T - Type of data items
 */
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const pageCount = Math.ceil(total / limit);
  const hasMore = page < pageCount;

  return {
    data,
    page,
    limit,
    total,
    hasMore,
    pageCount,
  };
}
