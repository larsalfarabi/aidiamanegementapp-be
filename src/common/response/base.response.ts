import { ResponseSuccess, ResponsePagination } from '../interface/index';

class BaseResponse {
  _success(message: string, data?: any): ResponseSuccess {
    return {
      status: 'Success',
      message: message,
      data: data || {},
    };
  }

  _pagination(
    message: string,
    data: any,
    total: number,
    page: number,
    pageSize: number,
  ): ResponsePagination {
    return {
      status: 'Success',
      message: message,
      data: data,
      pagination: {
        total: total,
        page: page,
        pageSize: pageSize,
      },
    };
  }

  _fail(message: string, statusCode?: number): any {
    return {
      status: 'Error',
      message: message,
      statusCode: statusCode || 400,
    };
  }
}

export default BaseResponse;
