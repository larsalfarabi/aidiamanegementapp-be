import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const InjectDeletedBy = createParamDecorator(
  (data: any, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();

    req.body.deletedBy = { id: req.user.id };

    return req.body;
  },
);
