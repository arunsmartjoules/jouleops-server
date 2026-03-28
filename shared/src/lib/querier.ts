export interface FilterRule {
  fieldId: string;
  operator: string;
  value: any;
  valueEnd?: any;
}

export interface QueryOptions {
  search?: string;
  filters?: FilterRule[] | string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number | string;
  limit?: number | string;
}

export interface QuerierConfig {
  searchFields?: string[];
  allowedFields?: string[];
  tableAlias?: string;
  defaultSort?: string;
  defaultSortOrder?: "asc" | "desc";
}

/**
 * Detects if a value is a date or timestamp string (ISO or YYYY-MM-DD)
 */
function isDateValue(val: any): boolean {
  if (typeof val !== "string") return false;
  // Match YYYY-MM-DD, ISO 8601, or YYYY-MM-DD HH:mm:ss
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(val) ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val) ||
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(val)
  );
}

/**
 * Builds standard SQL clauses (WHERE, ORDER BY, LIMIT/OFFSET) for server-side
 * pagination, filtering, and sorting.
 */
export function buildQuery(options: QueryOptions, config: QuerierConfig = {}) {
  const { search, filters, sortBy, sortOrder } = options;
  const page = Number(options.page) || 1;
  const limit = Number(options.limit) || 20;
  const {
    searchFields = [],
    allowedFields = [],
    tableAlias,
    defaultSort = "created_at",
    defaultSortOrder = "desc",
  } = config;

  const whereParts: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  const aliasPrefix = tableAlias ? `${tableAlias}.` : "";

  // 1. Search Logic
  if (search && searchFields.length > 0) {
    const searchConditions = searchFields
      .map((field) => `LOWER(${aliasPrefix}${field}::text) LIKE $${paramIdx++}`)
      .join(" OR ");
    whereParts.push(`(${searchConditions})`);
    const searchVal = `%${search.toLowerCase()}%`;
    for (let i = 0; i < searchFields.length; i++) {
      values.push(searchVal);
    }
  }

  // 2. Filter Logic
  let parsedFilters: FilterRule[] = [];
  if (typeof filters === "string") {
    try {
      parsedFilters = JSON.parse(filters);
    } catch (e) {
      console.error("[QUERIER] Failed to parse filters JSON", e);
    }
  } else if (Array.isArray(filters)) {
    parsedFilters = filters;
  }

  for (const rule of parsedFilters) {
    if (allowedFields.length > 0 && !allowedFields.includes(rule.fieldId))
      continue;
    if (rule.value === undefined || rule.value === null || rule.value === "")
      continue;

    const field = `${aliasPrefix}${rule.fieldId}`;
    const useDateCast = isDateValue(rule.value);

    switch (rule.operator) {
      case "equals":
      case "=":
        if (useDateCast) {
          whereParts.push(`${field}::date = $${paramIdx++}::date`);
        } else {
          whereParts.push(`${field} = $${paramIdx++}`);
        }
        values.push(rule.value);
        break;
      case "contains":
        whereParts.push(`LOWER(${field}::text) LIKE $${paramIdx++}`);
        values.push(`%${String(rule.value).toLowerCase()}%`);
        break;
      case "gt":
      case ">":
        whereParts.push(`${field} > $${paramIdx++}`);
        values.push(rule.value);
        break;
      case "lt":
      case "<":
        whereParts.push(`${field} < $${paramIdx++}`);
        values.push(rule.value);
        break;
      case "gte":
      case ">=":
        whereParts.push(`${field} >= $${paramIdx++}`);
        values.push(rule.value);
        break;
      case "lte":
      case "<=":
        whereParts.push(`${field} <= $${paramIdx++}`);
        values.push(rule.value);
        break;
      case "between":
        if (rule.value !== undefined && rule.valueEnd !== undefined) {
          if (useDateCast) {
            whereParts.push(
              `${field}::date BETWEEN $${paramIdx++}::date AND $${paramIdx++}::date`,
            );
          } else {
            whereParts.push(
              `${field} BETWEEN $${paramIdx++} AND $${paramIdx++}`,
            );
          }
          values.push(rule.value, rule.valueEnd);
        }
        break;
      case "in":
        if (Array.isArray(rule.value) && rule.value.length > 0) {
          const placeholders = rule.value.map(() => `$${paramIdx++}`).join(", ");
          whereParts.push(`${field} IN (${placeholders})`);
          values.push(...rule.value);
        }
        break;
    }
  }

  const whereClause =
    whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  // 3. Sorting Logic
  const sortKey =
    sortBy && (allowedFields.length === 0 || allowedFields.includes(sortBy))
      ? sortBy
      : defaultSort;
  const direction =
    (sortOrder || defaultSortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";
  const orderClause = `ORDER BY ${aliasPrefix}${sortKey} ${direction}`;

  // 4. Pagination Logic
  const offset = (page - 1) * limit;
  const limitClause = `LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  values.push(limit, offset);

  return {
    whereClause,
    orderClause,
    limitClause,
    values,
    nextParamIdx: paramIdx,
  };
}
