import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    // 1. Try to get GqlContext
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();

    // 2. Check if it's a GraphQL request (ctx.req usually exists in Express-GraphQL)
    if (ctx.req) {
      const req = ctx.req;
      const res = ctx.res || {
        // Mock Response if missing (e.g. in subscriptions or some contexts)
        header: () => {},
        headers: {},
      };

      return { req, res };
    }

    // 3. Fallback to HTTP (REST)
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
