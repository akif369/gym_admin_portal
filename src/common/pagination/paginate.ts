// ── Pagination Utilities ──────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ── Parse pagination query params ────────────────────────────────────────────

export function parsePagination(
  query: Record<string, unknown>,
  defaults: { page?: number; pageSize?: number } = {},
): PaginationParams {
  const rawPage = query['page'];
  const rawPageSize = query['pageSize'] ?? query['page_size'];

  const page = Math.max(1, parseInt(String(rawPage ?? defaults.page ?? 1), 10) || 1);
  const pageSize = Math.min(
    100, // Maximum allowed
    Math.max(1, parseInt(String(rawPageSize ?? defaults.pageSize ?? 20), 10) || 20),
  );

  return { page, pageSize };
}

// ── Calculate limit/offset for Drizzle ───────────────────────────────────────

export function paginationToLimitOffset(params: PaginationParams): {
  limit: number;
  offset: number;
} {
  return {
    limit: params.pageSize,
    offset: (params.page - 1) * params.pageSize,
  };
}

// ── Build paginated response ──────────────────────────────────────────────────

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.pageSize);
  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages,
    },
  };
}

// ── Cursor Pagination Utilities ───────────────────────────────────────────────

export interface CursorPaginationParams {
  cursor?: string;
  pageSize: number;
}

export interface PaginatedCursorResult<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

export function parseCursorPagination(
  query: Record<string, unknown>,
  defaults: { pageSize?: number } = {},
): CursorPaginationParams {
  const rawCursor = query['cursor'] as string | undefined;
  const rawPageSize = query['pageSize'] ?? query['page_size'];

  const pageSize = Math.min(
    100, // Maximum allowed
    Math.max(1, parseInt(String(rawPageSize ?? defaults.pageSize ?? 20), 10) || 20),
  );

  return { cursor: rawCursor, pageSize };
}

export function decodeCursor<T = any[]>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch (err) {
    return null;
  }
}

export function buildCursorPaginatedResponse<T>(
  itemsFetched: T[],
  pageSize: number,
  buildCursorFn: (item: T) => any[],
): PaginatedCursorResult<T> {
  // We expect itemsFetched to be requested with LIMIT = pageSize + 1
  const hasMore = itemsFetched.length > pageSize;
  const data = hasMore ? itemsFetched.slice(0, pageSize) : itemsFetched;
  
  let nextCursor: string | null = null;
  if (data.length > 0 && hasMore) {
    const lastItem = data[data.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify(buildCursorFn(lastItem))).toString('base64');
  }

  return {
    data,
    pagination: {
      nextCursor,
      hasMore,
      pageSize,
    },
  };
}
