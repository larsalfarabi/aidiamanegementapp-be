import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Pagination = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    if (!!request.query.page === false) {
      request.query.page = 1;
    }
    if (!!request.query.pageSize === false) {
      request.query.pageSize = 10;
    }
    request.query.limit =
      (Number(request.query.page) - 1) * Number(request.query.pageSize);
    request.query.pageSize = Number(request.query.pageSize);
    request.query.page = Number(request.query.page);

    return request.query;
  },
);
