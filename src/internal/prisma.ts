import { PrismaClient } from '@prisma/client';

type PaginateOptions<
  TWhere,
  TSelect,
  TOrderBy
> = {
  page?: number;
  pageSize?: number;
  where?: TWhere;
  select?: TSelect;
  orderBy?: TOrderBy;
};

type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export class PaginationService {
  constructor(private readonly prisma: PrismaClient) {
  }

  async paginate<
    TModel extends keyof PrismaClient,
    TDelegate = PrismaClient[TModel],
    TResult = TDelegate extends { findMany(args: infer A): Promise<infer R> }
      ? R
      : never,
    TArgs = TDelegate extends { findMany(args: infer A): any } ? A : never
  >(
    model: TModel,
    options: PaginateOptions<
      TArgs extends { where?: infer W } ? W : never,
      TArgs extends { select?: infer S } ? S : never,
      TArgs extends { orderBy?: infer O } ? O : never
    >
  ): Promise<PaginatedResult<TResult>> {
    const { page = 1, pageSize = 10, where, select, orderBy } = options;

    const skip = (page - 1) * pageSize;

    const delegate = this.prisma[model] as any;

    const [data, total] = await Promise.all([
      delegate.findMany({
        where,
        select,
        orderBy,
        skip,
        take: pageSize,
      }),
      delegate.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
