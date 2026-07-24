// src/utils/response.js
// 统一响应格式
function success(data = null, message = 'OK') {
  return { code: 0, message, data };
}

function fail(code = 1, message = 'Error', data = null) {
  return { code, message, data };
}

// 业务错误码
const ErrorCode = {
  PARAM_INVALID: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAY_FAILED: 1001,
  REFUND_FAILED: 1002,
  WITHDRAW_FAILED: 1003
};

class BizError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.isBizError = true;
  }
}

module.exports = { success, fail, BizError, ErrorCode };