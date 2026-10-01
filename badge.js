/* أدوات الباجة — مشتركة بين الصفحات (بلا مكتبات خارجية)
 *  - كود الباجة: 6 أرقام = رقم الفئة + 4 أرقام تسلسلية + رقم تحقق (Luhn)
 *  - مولّد باركود Code128 (نمط C للأرقام) بصيغة SVG
 */
(function () {
  // أنماط Code128 القياسية (107 رمزًا): 1 = خط أسود، 0 = فراغ
  var BARS = [11011001100, 11001101100, 11001100110, 10010011000, 10010001100, 10001001100, 10011001000, 10011000100, 10001100100, 11001001000, 11001000100, 11000100100, 10110011100, 10011011100, 10011001110, 10111001100, 10011101100, 10011100110, 11001110010, 11001011100, 11001001110, 11011100100, 11001110100, 11101101110, 11101001100, 11100101100, 11100100110, 11101100100, 11100110100, 11100110010, 11011011000, 11011000110, 11000110110, 10100011000, 10001011000, 10001000110, 10110001000, 10001101000, 10001100010, 11010001000, 11000101000, 11000100010, 10110111000, 10110001110, 10001101110, 10111011000, 10111000110, 10001110110, 11101110110, 11010001110, 11000101110, 11011101000, 11011100010, 11011101110, 11101011000, 11101000110, 11100010110, 11101101000, 11101100010, 11100011010, 11101111010, 11001000010, 11110001010, 10100110000, 10100001100, 10010110000, 10010000110, 10000101100, 10000100110, 10110010000, 10110000100, 10011010000, 10011000010, 10000110100, 10000110010, 11000010010, 11001010000, 11110111010, 11000010100, 10001111010, 10100111100, 10010111100, 10010011110, 10111100100, 10011110100, 10011110010, 11110100100, 11110010100, 11110010010, 11011011110, 11011110110, 11110110110, 10101111000, 10100011110, 10001011110, 10111101000, 10111100010, 11110101000, 11110100010, 10111011110, 10111101110, 11101011110, 11110101110, 11010000100, 11010010000, 11010011100, 1100011101011];
  var START_C = 105, STOP = 106;

  /* سلسلة 0/1 لكود رقمي زوجي الطول (Code128-C) */
  function encode(digits) {
    digits = String(digits);
    if (!/^(\d\d)+$/.test(digits)) throw new Error('Code128-C يحتاج أرقامًا بعدد زوجي');
    var codes = [START_C];
    for (var i = 0; i < digits.length; i += 2) codes.push(parseInt(digits.substr(i, 2), 10));
    var sum = codes[0];
    for (var j = 1; j < codes.length; j++) sum += codes[j] * j;
    codes.push(sum % 103);
    codes.push(STOP);
    return codes.map(function (c) { return String(BARS[c]); }).join('');
  }

  /* SVG للباركود: module = عرض أصغر خط، height = الارتفاع، quiet = هامش أبيض بعدد الوحدات */
  function svg(digits, opt) {
    opt = opt || {};
    var bits = encode(digits), quiet = opt.quiet == null ? 10 : opt.quiet, h = opt.height || 50;
    var w = bits.length + quiet * 2, rects = '', x = 0;
    while (x < bits.length) {
      if (bits[x] === '1') {
        var run = 1;
        while (bits[x + run] === '1') run++;
        rects += '<rect x="' + (x + quiet) + '" y="0" width="' + run + '" height="' + h + '"/>';
        x += run;
      } else x++;
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" ' +
      'shape-rendering="crispEdges" aria-label="' + digits + '"><rect width="' + w + '" height="' + h + '" fill="#fff"/>' +
      '<g fill="#000">' + rects + '</g></svg>';
  }

  /* رقم تحقق Luhn لسلسلة أرقام */
  function luhn(payload) {
    var sum = 0, dbl = true;
    for (var i = payload.length - 1; i >= 0; i--) {
      var d = +payload[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    return String((10 - sum % 10) % 10);
  }

  /* تنظيف ما يكتبه جهاز السحب: أرقام هندية/فارسية → إنجليزية، وحذف أي شيء غير رقمي */
  function normalize(s) {
    return String(s == null ? '' : s)
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
      .replace(/\D/g, '');
  }

  function valid(code) {
    code = normalize(code);
    return /^\d{6}$/.test(code) && code[0] !== '0' && luhn(code.slice(0, 5)) === code[5];
  }

  function make(prefix, serial) {
    var p = String(prefix) + ('0000' + serial).slice(-4);
    return p + luhn(p);
  }

  /* رمز QR بصيغة SVG (يتطلب ملف qrcode.js) — للمسح بكاميرا الجوال */
  function qr(digits) {
    if (typeof window.qrcode !== 'function') return '';
    var q = window.qrcode(0, 'M');
    q.addData(String(digits), 'Numeric');
    q.make();
    var n = q.getModuleCount(), m = 2, size = n + m * 2, path = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) path += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" aria-label="QR ' + digits + '">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
  }

  window.Badge = { encode: encode, svg: svg, qr: qr, luhn: luhn, normalize: normalize, valid: valid, make: make };
})();
