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
