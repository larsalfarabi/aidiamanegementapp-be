import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const InjectUpdatedBy = createParamDecorator(
  (data: any, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();

    req.body.updatedBy = { id: req.user.id };

    return req.body;
  },
);
