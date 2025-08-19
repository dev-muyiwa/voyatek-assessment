/**
 * Base row type for mysql tables
 */
export interface Model {
  /**
   * ID of the row
   */
  id: string;
  /**
   * date the row was created
   */
  created_at: Date;
  /**
   * date the row was updated
   */
  updated_at: Date | null;
  /**
   * date the row was deleted
   */
  deleted_at: Date | null;
}

export type PrismaPaginationOptions<Where, OrderBy, Select, Include> = {
  page?: number;
  limit?: number;
  where?: Where;
  orderBy?: OrderBy;
  select?: Select;
  include?: Include;
};

export type PrismaFindManyArgs<Where, OrderBy, Select, Include> = {
  where?: Where;
  orderBy?: OrderBy;
  select?: Select;
  include?: Include;
  skip?: number;
  take?: number;
};

export type PrismaCountArgs<Where> = {
  where?: Where;
};

export class Pagination<T> {
  docs: T[];
  total: number;
  totalPages: number;
  current: number;
  prev: number | null;
  next: number | null;

  constructor(
    docs: T[],
    total: number,
    current: number,
    limit: number,
  ) {
    this.docs = docs;
    this.total = total;
    this.totalPages = Math.ceil(total / limit);
    this.current = Number(current);
    this.prev = Number(current) > 1 ? Number(current) - 1 : null;
    this.next = Number(current) < this.totalPages ? Number(current) + 1 : null;
  }

  public static async createPaginatedResponse<
    T,
    Where = unknown,
    OrderBy = unknown,
    Select = unknown,
    Include = unknown
  >(
    delegate: {
      findMany: (args: PrismaFindManyArgs<Where, OrderBy, Select, Include>) => Promise<T[]>;
      count: (args: PrismaCountArgs<Where>) => Promise<number>;
    },
    options: PrismaPaginationOptions<Where, OrderBy, Select, Include> = {},
  ): Promise<Pagination<T>> {
    const page: number = options.page ?? 1;
    const limit: number = options.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Where | undefined = options.where;
    const orderBy: OrderBy | undefined = options.orderBy;
    const select: Select | undefined = options.select;
    const include: Include | undefined = options.include;

    const [docs, total] = await Promise.all([
      delegate.findMany({ where, orderBy, select, include, skip, take: limit }),
      delegate.count({ where }),
    ]);

    return new Pagination<T>(docs, total, page, limit);
  }
}

