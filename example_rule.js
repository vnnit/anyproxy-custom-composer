'use strict';

/**
 * File Rule Mẫu cho AnyProxy Custom Rule
 * 
 * Bạn có thể chọn file này (hoặc bất kỳ file .js nào trên máy)
 * qua giao diện Web: [📋 Quản Lý Rules] -> [📁 File Rule .JS Tùy Chọn]
 */

module.exports = {
  summary: 'File Rule Mẫu - Custom Request & Response Modifier',

  // 1. Can thiệp Request trước khi gửi lên Server
  *beforeSendRequest(requestDetail) {
    const proto = requestDetail.protocol || 'http';
    const host = (requestDetail.requestOptions && requestDetail.requestOptions.hostname) || '';
    const pathStr = (requestDetail.requestOptions && requestDetail.requestOptions.path) || '';
    const fullUrl = `${proto}://${host}${pathStr}`;

    // Ví dụ: Bắt request chứa URL cụ thể
    if (fullUrl.includes('/example/api')) {
      console.log('[ExampleRule] Bắt request:', fullUrl);

      // Thêm header hoặc sửa body nếu muốn
      const newHeaders = Object.assign({}, requestDetail.requestOptions.headers);
      newHeaders['x-custom-proxy'] = 'AnyProxy-Custom';

      return {
        requestOptions: Object.assign({}, requestDetail.requestOptions, { headers: newHeaders })
      };
    }

    return null; // Giữ nguyên request
  },

  // 2. Can thiệp Response trước khi trả về cho Client / App
  *beforeSendResponse(requestDetail, responseDetail) {
    const fullUrl = requestDetail.url || '';

    // Ví dụ: Bắt response từ server và sửa nội dung
    if (fullUrl.includes('/example/status')) {
      console.log('[ExampleRule] Sửa response cho:', fullUrl);

      const modifiedBody = JSON.stringify({
        code: 0,
        message: 'Success from custom rule',
        data: {
          status: 'online',
          mocked: true
        }
      });

      return {
        response: {
          statusCode: 200,
          header: Object.assign({}, responseDetail.response.header, {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(modifiedBody, 'utf8')
          }),
          body: Buffer.from(modifiedBody, 'utf8')
        }
      };
    }

    return null; // Giữ nguyên response từ server
  }
};
