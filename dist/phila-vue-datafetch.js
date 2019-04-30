(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('axios'), require('moment'), require('proj4'), require('leaflet'), require('esri-leaflet'), require('vue')) :
  typeof define === 'function' && define.amd ? define(['exports', 'axios', 'moment', 'proj4', 'leaflet', 'esri-leaflet', 'vue'], factory) :
  (factory((global.philaVueDatafetch = {}),global.axios,global.moment,global.proj4,global.L,global.L.esri,global.Vue));
}(this, (function (exports,axios,moment,proj4,L,esriLeaflet,vue) { 'use strict';

  axios = axios && axios.hasOwnProperty('default') ? axios['default'] : axios;
  moment = moment && moment.hasOwnProperty('default') ? moment['default'] : moment;
  proj4 = proj4 && proj4.hasOwnProperty('default') ? proj4['default'] : proj4;
  vue = vue && vue.hasOwnProperty('default') ? vue['default'] : vue;

  /*! https://mths.be/punycode v1.4.1 by @mathias */


  /** Highest positive signed 32-bit float value */
  var maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

  /** Bootstring parameters */
  var base = 36;
  var tMin = 1;
  var tMax = 26;
  var skew = 38;
  var damp = 700;
  var initialBias = 72;
  var initialN = 128; // 0x80
  var delimiter = '-'; // '\x2D'
  var regexNonASCII = /[^\x20-\x7E]/; // unprintable ASCII chars + non-ASCII chars
  var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators

  /** Error messages */
  var errors = {
    'overflow': 'Overflow: input needs wider integers to process',
    'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
    'invalid-input': 'Invalid input'
  };

  /** Convenience shortcuts */
  var baseMinusTMin = base - tMin;
  var floor = Math.floor;
  var stringFromCharCode = String.fromCharCode;

  /*--------------------------------------------------------------------------*/

  /**
   * A generic error utility function.
   * @private
   * @param {String} type The error type.
   * @returns {Error} Throws a `RangeError` with the applicable error message.
   */
  function error(type) {
    throw new RangeError(errors[type]);
  }

  /**
   * A generic `Array#map` utility function.
   * @private
   * @param {Array} array The array to iterate over.
   * @param {Function} callback The function that gets called for every array
   * item.
   * @returns {Array} A new array of values returned by the callback function.
   */
  function map(array, fn) {
    var length = array.length;
    var result = [];
    while (length--) {
      result[length] = fn(array[length]);
    }
    return result;
  }

  /**
   * A simple `Array#map`-like wrapper to work with domain name strings or email
   * addresses.
   * @private
   * @param {String} domain The domain name or email address.
   * @param {Function} callback The function that gets called for every
   * character.
   * @returns {Array} A new string of characters returned by the callback
   * function.
   */
  function mapDomain(string, fn) {
    var parts = string.split('@');
    var result = '';
    if (parts.length > 1) {
      // In email addresses, only the domain name should be punycoded. Leave
      // the local part (i.e. everything up to `@`) intact.
      result = parts[0] + '@';
      string = parts[1];
    }
    // Avoid `split(regex)` for IE8 compatibility. See #17.
    string = string.replace(regexSeparators, '\x2E');
    var labels = string.split('.');
    var encoded = map(labels, fn).join('.');
    return result + encoded;
  }

  /**
   * Creates an array containing the numeric code points of each Unicode
   * character in the string. While JavaScript uses UCS-2 internally,
   * this function will convert a pair of surrogate halves (each of which
   * UCS-2 exposes as separate characters) into a single code point,
   * matching UTF-16.
   * @see `punycode.ucs2.encode`
   * @see <https://mathiasbynens.be/notes/javascript-encoding>
   * @memberOf punycode.ucs2
   * @name decode
   * @param {String} string The Unicode input string (UCS-2).
   * @returns {Array} The new array of code points.
   */
  function ucs2decode(string) {
    var output = [],
      counter = 0,
      length = string.length,
      value,
      extra;
    while (counter < length) {
      value = string.charCodeAt(counter++);
      if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
        // high surrogate, and there is a next character
        extra = string.charCodeAt(counter++);
        if ((extra & 0xFC00) == 0xDC00) { // low surrogate
          output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
        } else {
          // unmatched surrogate; only append this code unit, in case the next
          // code unit is the high surrogate of a surrogate pair
          output.push(value);
          counter--;
        }
      } else {
        output.push(value);
      }
    }
    return output;
  }

  /**
   * Converts a digit/integer into a basic code point.
   * @see `basicToDigit()`
   * @private
   * @param {Number} digit The numeric value of a basic code point.
   * @returns {Number} The basic code point whose value (when used for
   * representing integers) is `digit`, which needs to be in the range
   * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
   * used; else, the lowercase form is used. The behavior is undefined
   * if `flag` is non-zero and `digit` has no uppercase form.
   */
  function digitToBasic(digit, flag) {
    //  0..25 map to ASCII a..z or A..Z
    // 26..35 map to ASCII 0..9
    return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
  }

  /**
   * Bias adaptation function as per section 3.4 of RFC 3492.
   * https://tools.ietf.org/html/rfc3492#section-3.4
   * @private
   */
  function adapt(delta, numPoints, firstTime) {
    var k = 0;
    delta = firstTime ? floor(delta / damp) : delta >> 1;
    delta += floor(delta / numPoints);
    for ( /* no initialization */ ; delta > baseMinusTMin * tMax >> 1; k += base) {
      delta = floor(delta / baseMinusTMin);
    }
    return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
  }

  /**
   * Converts a string of Unicode symbols (e.g. a domain name label) to a
   * Punycode string of ASCII-only symbols.
   * @memberOf punycode
   * @param {String} input The string of Unicode symbols.
   * @returns {String} The resulting Punycode string of ASCII-only symbols.
   */
  function encode(input) {
    var n,
      delta,
      handledCPCount,
      basicLength,
      bias,
      j,
      m,
      q,
      k,
      t,
      currentValue,
      output = [],
      /** `inputLength` will hold the number of code points in `input`. */
      inputLength,
      /** Cached calculation results */
      handledCPCountPlusOne,
      baseMinusT,
      qMinusT;

    // Convert the input in UCS-2 to Unicode
    input = ucs2decode(input);

    // Cache the length
    inputLength = input.length;

    // Initialize the state
    n = initialN;
    delta = 0;
    bias = initialBias;

    // Handle the basic code points
    for (j = 0; j < inputLength; ++j) {
      currentValue = input[j];
      if (currentValue < 0x80) {
        output.push(stringFromCharCode(currentValue));
      }
    }

    handledCPCount = basicLength = output.length;

    // `handledCPCount` is the number of code points that have been handled;
    // `basicLength` is the number of basic code points.

    // Finish the basic string - if it is not empty - with a delimiter
    if (basicLength) {
      output.push(delimiter);
    }

    // Main encoding loop:
    while (handledCPCount < inputLength) {

      // All non-basic code points < n have been handled already. Find the next
      // larger one:
      for (m = maxInt, j = 0; j < inputLength; ++j) {
        currentValue = input[j];
        if (currentValue >= n && currentValue < m) {
          m = currentValue;
        }
      }

      // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
      // but guard against overflow
      handledCPCountPlusOne = handledCPCount + 1;
      if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
        error('overflow');
      }

      delta += (m - n) * handledCPCountPlusOne;
      n = m;

      for (j = 0; j < inputLength; ++j) {
        currentValue = input[j];

        if (currentValue < n && ++delta > maxInt) {
          error('overflow');
        }

        if (currentValue == n) {
          // Represent delta as a generalized variable-length integer
          for (q = delta, k = base; /* no condition */ ; k += base) {
            t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
            if (q < t) {
              break;
            }
            qMinusT = q - t;
            baseMinusT = base - t;
            output.push(
              stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
            );
            q = floor(qMinusT / baseMinusT);
          }

          output.push(stringFromCharCode(digitToBasic(q, 0)));
          bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
          delta = 0;
          ++handledCPCount;
        }
      }

      ++delta;
      ++n;

    }
    return output.join('');
  }

  /**
   * Converts a Unicode string representing a domain name or an email address to
   * Punycode. Only the non-ASCII parts of the domain name will be converted,
   * i.e. it doesn't matter if you call it with a domain that's already in
   * ASCII.
   * @memberOf punycode
   * @param {String} input The domain name or email address to convert, as a
   * Unicode string.
   * @returns {String} The Punycode representation of the given domain name or
   * email address.
   */
  function toASCII(input) {
    return mapDomain(input, function(string) {
      return regexNonASCII.test(string) ?
        'xn--' + encode(string) :
        string;
    });
  }

  var global$1 = (typeof global !== "undefined" ? global :
              typeof self !== "undefined" ? self :
              typeof window !== "undefined" ? window : {});

  var lookup = [];
  var revLookup = [];
  var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
  var inited = false;
  function init () {
    inited = true;
    var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }

    revLookup['-'.charCodeAt(0)] = 62;
    revLookup['_'.charCodeAt(0)] = 63;
  }

  function toByteArray (b64) {
    if (!inited) {
      init();
    }
    var i, j, l, tmp, placeHolders, arr;
    var len = b64.length;

    if (len % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4')
    }

    // the number of equal signs (place holders)
    // if there are two placeholders, than the two characters before it
    // represent one byte
    // if there is only one, then the three characters before it represent 2 bytes
    // this is just a cheap hack to not do indexOf twice
    placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

    // base64 is 4/3 + up to two characters of the original data
    arr = new Arr(len * 3 / 4 - placeHolders);

    // if there are placeholders, only get up to the last complete 4 chars
    l = placeHolders > 0 ? len - 4 : len;

    var L$$1 = 0;

    for (i = 0, j = 0; i < l; i += 4, j += 3) {
      tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
      arr[L$$1++] = (tmp >> 16) & 0xFF;
      arr[L$$1++] = (tmp >> 8) & 0xFF;
      arr[L$$1++] = tmp & 0xFF;
    }

    if (placeHolders === 2) {
      tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
      arr[L$$1++] = tmp & 0xFF;
    } else if (placeHolders === 1) {
      tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
      arr[L$$1++] = (tmp >> 8) & 0xFF;
      arr[L$$1++] = tmp & 0xFF;
    }

    return arr
  }

  function tripletToBase64 (num) {
    return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
  }

  function encodeChunk (uint8, start, end) {
    var tmp;
    var output = [];
    for (var i = start; i < end; i += 3) {
      tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
      output.push(tripletToBase64(tmp));
    }
    return output.join('')
  }

  function fromByteArray (uint8) {
    if (!inited) {
      init();
    }
    var tmp;
    var len = uint8.length;
    var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
    var output = '';
    var parts = [];
    var maxChunkLength = 16383; // must be multiple of 3

    // go through the array every three bytes, we'll deal with trailing stuff later
    for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
      parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
    }

    // pad the end with zeros, but make sure to not forget the extra bytes
    if (extraBytes === 1) {
      tmp = uint8[len - 1];
      output += lookup[tmp >> 2];
      output += lookup[(tmp << 4) & 0x3F];
      output += '==';
    } else if (extraBytes === 2) {
      tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
      output += lookup[tmp >> 10];
      output += lookup[(tmp >> 4) & 0x3F];
      output += lookup[(tmp << 2) & 0x3F];
      output += '=';
    }

    parts.push(output);

    return parts.join('')
  }

  function read (buffer, offset, isLE, mLen, nBytes) {
    var e, m;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var nBits = -7;
    var i = isLE ? (nBytes - 1) : 0;
    var d = isLE ? -1 : 1;
    var s = buffer[offset + i];

    i += d;

    e = s & ((1 << (-nBits)) - 1);
    s >>= (-nBits);
    nBits += eLen;
    for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    m = e & ((1 << (-nBits)) - 1);
    e >>= (-nBits);
    nBits += mLen;
    for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    if (e === 0) {
      e = 1 - eBias;
    } else if (e === eMax) {
      return m ? NaN : ((s ? -1 : 1) * Infinity)
    } else {
      m = m + Math.pow(2, mLen);
      e = e - eBias;
    }
    return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
  }

  function write (buffer, value, offset, isLE, mLen, nBytes) {
    var e, m, c;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
    var i = isLE ? 0 : (nBytes - 1);
    var d = isLE ? 1 : -1;
    var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

    value = Math.abs(value);

    if (isNaN(value) || value === Infinity) {
      m = isNaN(value) ? 1 : 0;
      e = eMax;
    } else {
      e = Math.floor(Math.log(value) / Math.LN2);
      if (value * (c = Math.pow(2, -e)) < 1) {
        e--;
        c *= 2;
      }
      if (e + eBias >= 1) {
        value += rt / c;
      } else {
        value += rt * Math.pow(2, 1 - eBias);
      }
      if (value * c >= 2) {
        e++;
        c /= 2;
      }

      if (e + eBias >= eMax) {
        m = 0;
        e = eMax;
      } else if (e + eBias >= 1) {
        m = (value * c - 1) * Math.pow(2, mLen);
        e = e + eBias;
      } else {
        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
        e = 0;
      }
    }

    for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

    e = (e << mLen) | m;
    eLen += mLen;
    for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

    buffer[offset + i - d] |= s * 128;
  }

  var toString = {}.toString;

  var isArray = Array.isArray || function (arr) {
    return toString.call(arr) == '[object Array]';
  };

  var INSPECT_MAX_BYTES = 50;

  /**
   * If `Buffer.TYPED_ARRAY_SUPPORT`:
   *   === true    Use Uint8Array implementation (fastest)
   *   === false   Use Object implementation (most compatible, even IE6)
   *
   * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
   * Opera 11.6+, iOS 4.2+.
   *
   * Due to various browser bugs, sometimes the Object implementation will be used even
   * when the browser supports typed arrays.
   *
   * Note:
   *
   *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
   *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
   *
   *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
   *
   *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
   *     incorrect length in some situations.

   * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
   * get the Object implementation, which is slower but behaves correctly.
   */
  Buffer.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
    ? global$1.TYPED_ARRAY_SUPPORT
    : true;

  function kMaxLength () {
    return Buffer.TYPED_ARRAY_SUPPORT
      ? 0x7fffffff
      : 0x3fffffff
  }

  function createBuffer (that, length) {
    if (kMaxLength() < length) {
      throw new RangeError('Invalid typed array length')
    }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = new Uint8Array(length);
      that.__proto__ = Buffer.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      if (that === null) {
        that = new Buffer(length);
      }
      that.length = length;
    }

    return that
  }

  /**
   * The Buffer constructor returns instances of `Uint8Array` that have their
   * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
   * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
   * and the `Uint8Array` methods. Square bracket notation works as expected -- it
   * returns a single octet.
   *
   * The `Uint8Array` prototype remains unmodified.
   */

  function Buffer (arg, encodingOrOffset, length) {
    if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
      return new Buffer(arg, encodingOrOffset, length)
    }

    // Common case.
    if (typeof arg === 'number') {
      if (typeof encodingOrOffset === 'string') {
        throw new Error(
          'If encoding is specified then the first argument must be a string'
        )
      }
      return allocUnsafe(this, arg)
    }
    return from(this, arg, encodingOrOffset, length)
  }

  Buffer.poolSize = 8192; // not used by this implementation

  // TODO: Legacy, not needed anymore. Remove in next major version.
  Buffer._augment = function (arr) {
    arr.__proto__ = Buffer.prototype;
    return arr
  };

  function from (that, value, encodingOrOffset, length) {
    if (typeof value === 'number') {
      throw new TypeError('"value" argument must not be a number')
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return fromArrayBuffer(that, value, encodingOrOffset, length)
    }

    if (typeof value === 'string') {
      return fromString(that, value, encodingOrOffset)
    }

    return fromObject(that, value)
  }

  /**
   * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
   * if value is a number.
   * Buffer.from(str[, encoding])
   * Buffer.from(array)
   * Buffer.from(buffer)
   * Buffer.from(arrayBuffer[, byteOffset[, length]])
   **/
  Buffer.from = function (value, encodingOrOffset, length) {
    return from(null, value, encodingOrOffset, length)
  };

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    Buffer.prototype.__proto__ = Uint8Array.prototype;
    Buffer.__proto__ = Uint8Array;
  }

  function assertSize (size) {
    if (typeof size !== 'number') {
      throw new TypeError('"size" argument must be a number')
    } else if (size < 0) {
      throw new RangeError('"size" argument must not be negative')
    }
  }

  function alloc (that, size, fill, encoding) {
    assertSize(size);
    if (size <= 0) {
      return createBuffer(that, size)
    }
    if (fill !== undefined) {
      // Only pay attention to encoding if it's a string. This
      // prevents accidentally sending in a number that would
      // be interpretted as a start offset.
      return typeof encoding === 'string'
        ? createBuffer(that, size).fill(fill, encoding)
        : createBuffer(that, size).fill(fill)
    }
    return createBuffer(that, size)
  }

  /**
   * Creates a new filled Buffer instance.
   * alloc(size[, fill[, encoding]])
   **/
  Buffer.alloc = function (size, fill, encoding) {
    return alloc(null, size, fill, encoding)
  };

  function allocUnsafe (that, size) {
    assertSize(size);
    that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
    if (!Buffer.TYPED_ARRAY_SUPPORT) {
      for (var i = 0; i < size; ++i) {
        that[i] = 0;
      }
    }
    return that
  }

  /**
   * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
   * */
  Buffer.allocUnsafe = function (size) {
    return allocUnsafe(null, size)
  };
  /**
   * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
   */
  Buffer.allocUnsafeSlow = function (size) {
    return allocUnsafe(null, size)
  };

  function fromString (that, string, encoding) {
    if (typeof encoding !== 'string' || encoding === '') {
      encoding = 'utf8';
    }

    if (!Buffer.isEncoding(encoding)) {
      throw new TypeError('"encoding" must be a valid string encoding')
    }

    var length = byteLength(string, encoding) | 0;
    that = createBuffer(that, length);

    var actual = that.write(string, encoding);

    if (actual !== length) {
      // Writing a hex string, for example, that contains invalid characters will
      // cause everything after the first invalid character to be ignored. (e.g.
      // 'abxxcd' will be treated as 'ab')
      that = that.slice(0, actual);
    }

    return that
  }

  function fromArrayLike (that, array) {
    var length = array.length < 0 ? 0 : checked(array.length) | 0;
    that = createBuffer(that, length);
    for (var i = 0; i < length; i += 1) {
      that[i] = array[i] & 255;
    }
    return that
  }

  function fromArrayBuffer (that, array, byteOffset, length) {
    array.byteLength; // this throws if `array` is not a valid ArrayBuffer

    if (byteOffset < 0 || array.byteLength < byteOffset) {
      throw new RangeError('\'offset\' is out of bounds')
    }

    if (array.byteLength < byteOffset + (length || 0)) {
      throw new RangeError('\'length\' is out of bounds')
    }

    if (byteOffset === undefined && length === undefined) {
      array = new Uint8Array(array);
    } else if (length === undefined) {
      array = new Uint8Array(array, byteOffset);
    } else {
      array = new Uint8Array(array, byteOffset, length);
    }

    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = array;
      that.__proto__ = Buffer.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      that = fromArrayLike(that, array);
    }
    return that
  }

  function fromObject (that, obj) {
    if (internalIsBuffer(obj)) {
      var len = checked(obj.length) | 0;
      that = createBuffer(that, len);

      if (that.length === 0) {
        return that
      }

      obj.copy(that, 0, 0, len);
      return that
    }

    if (obj) {
      if ((typeof ArrayBuffer !== 'undefined' &&
          obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
        if (typeof obj.length !== 'number' || isnan(obj.length)) {
          return createBuffer(that, 0)
        }
        return fromArrayLike(that, obj)
      }

      if (obj.type === 'Buffer' && isArray(obj.data)) {
        return fromArrayLike(that, obj.data)
      }
    }

    throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
  }

  function checked (length) {
    // Note: cannot use `length < kMaxLength()` here because that fails when
    // length is NaN (which is otherwise coerced to zero.)
    if (length >= kMaxLength()) {
      throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                           'size: 0x' + kMaxLength().toString(16) + ' bytes')
    }
    return length | 0
  }
  Buffer.isBuffer = isBuffer;
  function internalIsBuffer (b) {
    return !!(b != null && b._isBuffer)
  }

  Buffer.compare = function compare (a, b) {
    if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
      throw new TypeError('Arguments must be Buffers')
    }

    if (a === b) { return 0 }

    var x = a.length;
    var y = b.length;

    for (var i = 0, len = Math.min(x, y); i < len; ++i) {
      if (a[i] !== b[i]) {
        x = a[i];
        y = b[i];
        break
      }
    }

    if (x < y) { return -1 }
    if (y < x) { return 1 }
    return 0
  };

  Buffer.isEncoding = function isEncoding (encoding) {
    switch (String(encoding).toLowerCase()) {
      case 'hex':
      case 'utf8':
      case 'utf-8':
      case 'ascii':
      case 'latin1':
      case 'binary':
      case 'base64':
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return true
      default:
        return false
    }
  };

  Buffer.concat = function concat (list, length) {
    if (!isArray(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }

    if (list.length === 0) {
      return Buffer.alloc(0)
    }

    var i;
    if (length === undefined) {
      length = 0;
      for (i = 0; i < list.length; ++i) {
        length += list[i].length;
      }
    }

    var buffer = Buffer.allocUnsafe(length);
    var pos = 0;
    for (i = 0; i < list.length; ++i) {
      var buf = list[i];
      if (!internalIsBuffer(buf)) {
        throw new TypeError('"list" argument must be an Array of Buffers')
      }
      buf.copy(buffer, pos);
      pos += buf.length;
    }
    return buffer
  };

  function byteLength (string, encoding) {
    if (internalIsBuffer(string)) {
      return string.length
    }
    if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
        (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
      return string.byteLength
    }
    if (typeof string !== 'string') {
      string = '' + string;
    }

    var len = string.length;
    if (len === 0) { return 0 }

    // Use a for loop to avoid recursion
    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'ascii':
        case 'latin1':
        case 'binary':
          return len
        case 'utf8':
        case 'utf-8':
        case undefined:
          return utf8ToBytes(string).length
        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return len * 2
        case 'hex':
          return len >>> 1
        case 'base64':
          return base64ToBytes(string).length
        default:
          if (loweredCase) { return utf8ToBytes(string).length } // assume utf8
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  }
  Buffer.byteLength = byteLength;

  function slowToString (encoding, start, end) {
    var loweredCase = false;

    // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
    // property of a typed array.

    // This behaves neither like String nor Uint8Array in that we set start/end
    // to their upper/lower bounds if the value passed is out of range.
    // undefined is handled specially as per ECMA-262 6th Edition,
    // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
    if (start === undefined || start < 0) {
      start = 0;
    }
    // Return early if start > this.length. Done here to prevent potential uint32
    // coercion fail below.
    if (start > this.length) {
      return ''
    }

    if (end === undefined || end > this.length) {
      end = this.length;
    }

    if (end <= 0) {
      return ''
    }

    // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
    end >>>= 0;
    start >>>= 0;

    if (end <= start) {
      return ''
    }

    if (!encoding) { encoding = 'utf8'; }

    while (true) {
      switch (encoding) {
        case 'hex':
          return hexSlice(this, start, end)

        case 'utf8':
        case 'utf-8':
          return utf8Slice(this, start, end)

        case 'ascii':
          return asciiSlice(this, start, end)

        case 'latin1':
        case 'binary':
          return latin1Slice(this, start, end)

        case 'base64':
          return base64Slice(this, start, end)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return utf16leSlice(this, start, end)

        default:
          if (loweredCase) { throw new TypeError('Unknown encoding: ' + encoding) }
          encoding = (encoding + '').toLowerCase();
          loweredCase = true;
      }
    }
  }

  // The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
  // Buffer instances.
  Buffer.prototype._isBuffer = true;

  function swap (b, n, m) {
    var i = b[n];
    b[n] = b[m];
    b[m] = i;
  }

  Buffer.prototype.swap16 = function swap16 () {
    var len = this.length;
    if (len % 2 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 16-bits')
    }
    for (var i = 0; i < len; i += 2) {
      swap(this, i, i + 1);
    }
    return this
  };

  Buffer.prototype.swap32 = function swap32 () {
    var len = this.length;
    if (len % 4 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 32-bits')
    }
    for (var i = 0; i < len; i += 4) {
      swap(this, i, i + 3);
      swap(this, i + 1, i + 2);
    }
    return this
  };

  Buffer.prototype.swap64 = function swap64 () {
    var len = this.length;
    if (len % 8 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 64-bits')
    }
    for (var i = 0; i < len; i += 8) {
      swap(this, i, i + 7);
      swap(this, i + 1, i + 6);
      swap(this, i + 2, i + 5);
      swap(this, i + 3, i + 4);
    }
    return this
  };

  Buffer.prototype.toString = function toString () {
    var length = this.length | 0;
    if (length === 0) { return '' }
    if (arguments.length === 0) { return utf8Slice(this, 0, length) }
    return slowToString.apply(this, arguments)
  };

  Buffer.prototype.equals = function equals (b) {
    if (!internalIsBuffer(b)) { throw new TypeError('Argument must be a Buffer') }
    if (this === b) { return true }
    return Buffer.compare(this, b) === 0
  };

  Buffer.prototype.inspect = function inspect () {
    var str = '';
    var max = INSPECT_MAX_BYTES;
    if (this.length > 0) {
      str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
      if (this.length > max) { str += ' ... '; }
    }
    return '<Buffer ' + str + '>'
  };

  Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
    if (!internalIsBuffer(target)) {
      throw new TypeError('Argument must be a Buffer')
    }

    if (start === undefined) {
      start = 0;
    }
    if (end === undefined) {
      end = target ? target.length : 0;
    }
    if (thisStart === undefined) {
      thisStart = 0;
    }
    if (thisEnd === undefined) {
      thisEnd = this.length;
    }

    if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
      throw new RangeError('out of range index')
    }

    if (thisStart >= thisEnd && start >= end) {
      return 0
    }
    if (thisStart >= thisEnd) {
      return -1
    }
    if (start >= end) {
      return 1
    }

    start >>>= 0;
    end >>>= 0;
    thisStart >>>= 0;
    thisEnd >>>= 0;

    if (this === target) { return 0 }

    var x = thisEnd - thisStart;
    var y = end - start;
    var len = Math.min(x, y);

    var thisCopy = this.slice(thisStart, thisEnd);
    var targetCopy = target.slice(start, end);

    for (var i = 0; i < len; ++i) {
      if (thisCopy[i] !== targetCopy[i]) {
        x = thisCopy[i];
        y = targetCopy[i];
        break
      }
    }

    if (x < y) { return -1 }
    if (y < x) { return 1 }
    return 0
  };

  // Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
  // OR the last index of `val` in `buffer` at offset <= `byteOffset`.
  //
  // Arguments:
  // - buffer - a Buffer to search
  // - val - a string, Buffer, or number
  // - byteOffset - an index into `buffer`; will be clamped to an int32
  // - encoding - an optional encoding, relevant is val is a string
  // - dir - true for indexOf, false for lastIndexOf
  function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
    // Empty buffer means no match
    if (buffer.length === 0) { return -1 }

    // Normalize byteOffset
    if (typeof byteOffset === 'string') {
      encoding = byteOffset;
      byteOffset = 0;
    } else if (byteOffset > 0x7fffffff) {
      byteOffset = 0x7fffffff;
    } else if (byteOffset < -0x80000000) {
      byteOffset = -0x80000000;
    }
    byteOffset = +byteOffset;  // Coerce to Number.
    if (isNaN(byteOffset)) {
      // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
      byteOffset = dir ? 0 : (buffer.length - 1);
    }

    // Normalize byteOffset: negative offsets start from the end of the buffer
    if (byteOffset < 0) { byteOffset = buffer.length + byteOffset; }
    if (byteOffset >= buffer.length) {
      if (dir) { return -1 }
      else { byteOffset = buffer.length - 1; }
    } else if (byteOffset < 0) {
      if (dir) { byteOffset = 0; }
      else { return -1 }
    }

    // Normalize val
    if (typeof val === 'string') {
      val = Buffer.from(val, encoding);
    }

    // Finally, search either indexOf (if dir is true) or lastIndexOf
    if (internalIsBuffer(val)) {
      // Special case: looking for empty string/buffer always fails
      if (val.length === 0) {
        return -1
      }
      return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
    } else if (typeof val === 'number') {
      val = val & 0xFF; // Search for a byte value [0-255]
      if (Buffer.TYPED_ARRAY_SUPPORT &&
          typeof Uint8Array.prototype.indexOf === 'function') {
        if (dir) {
          return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
        } else {
          return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
        }
      }
      return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
    }

    throw new TypeError('val must be string, number or Buffer')
  }

  function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
    var indexSize = 1;
    var arrLength = arr.length;
    var valLength = val.length;

    if (encoding !== undefined) {
      encoding = String(encoding).toLowerCase();
      if (encoding === 'ucs2' || encoding === 'ucs-2' ||
          encoding === 'utf16le' || encoding === 'utf-16le') {
        if (arr.length < 2 || val.length < 2) {
          return -1
        }
        indexSize = 2;
        arrLength /= 2;
        valLength /= 2;
        byteOffset /= 2;
      }
    }

    function read$$1 (buf, i) {
      if (indexSize === 1) {
        return buf[i]
      } else {
        return buf.readUInt16BE(i * indexSize)
      }
    }

    var i;
    if (dir) {
      var foundIndex = -1;
      for (i = byteOffset; i < arrLength; i++) {
        if (read$$1(arr, i) === read$$1(val, foundIndex === -1 ? 0 : i - foundIndex)) {
          if (foundIndex === -1) { foundIndex = i; }
          if (i - foundIndex + 1 === valLength) { return foundIndex * indexSize }
        } else {
          if (foundIndex !== -1) { i -= i - foundIndex; }
          foundIndex = -1;
        }
      }
    } else {
      if (byteOffset + valLength > arrLength) { byteOffset = arrLength - valLength; }
      for (i = byteOffset; i >= 0; i--) {
        var found = true;
        for (var j = 0; j < valLength; j++) {
          if (read$$1(arr, i + j) !== read$$1(val, j)) {
            found = false;
            break
          }
        }
        if (found) { return i }
      }
    }

    return -1
  }

  Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
    return this.indexOf(val, byteOffset, encoding) !== -1
  };

  Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
  };

  Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
  };

  function hexWrite (buf, string, offset, length) {
    offset = Number(offset) || 0;
    var remaining = buf.length - offset;
    if (!length) {
      length = remaining;
    } else {
      length = Number(length);
      if (length > remaining) {
        length = remaining;
      }
    }

    // must be an even number of digits
    var strLen = string.length;
    if (strLen % 2 !== 0) { throw new TypeError('Invalid hex string') }

    if (length > strLen / 2) {
      length = strLen / 2;
    }
    for (var i = 0; i < length; ++i) {
      var parsed = parseInt(string.substr(i * 2, 2), 16);
      if (isNaN(parsed)) { return i }
      buf[offset + i] = parsed;
    }
    return i
  }

  function utf8Write (buf, string, offset, length) {
    return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
  }

  function asciiWrite (buf, string, offset, length) {
    return blitBuffer(asciiToBytes(string), buf, offset, length)
  }

  function latin1Write (buf, string, offset, length) {
    return asciiWrite(buf, string, offset, length)
  }

  function base64Write (buf, string, offset, length) {
    return blitBuffer(base64ToBytes(string), buf, offset, length)
  }

  function ucs2Write (buf, string, offset, length) {
    return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  }

  Buffer.prototype.write = function write$$1 (string, offset, length, encoding) {
    // Buffer#write(string)
    if (offset === undefined) {
      encoding = 'utf8';
      length = this.length;
      offset = 0;
    // Buffer#write(string, encoding)
    } else if (length === undefined && typeof offset === 'string') {
      encoding = offset;
      length = this.length;
      offset = 0;
    // Buffer#write(string, offset[, length][, encoding])
    } else if (isFinite(offset)) {
      offset = offset | 0;
      if (isFinite(length)) {
        length = length | 0;
        if (encoding === undefined) { encoding = 'utf8'; }
      } else {
        encoding = length;
        length = undefined;
      }
    // legacy write(string, encoding, offset, length) - remove in v0.13
    } else {
      throw new Error(
        'Buffer.write(string, encoding, offset[, length]) is no longer supported'
      )
    }

    var remaining = this.length - offset;
    if (length === undefined || length > remaining) { length = remaining; }

    if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
      throw new RangeError('Attempt to write outside buffer bounds')
    }

    if (!encoding) { encoding = 'utf8'; }

    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'hex':
          return hexWrite(this, string, offset, length)

        case 'utf8':
        case 'utf-8':
          return utf8Write(this, string, offset, length)

        case 'ascii':
          return asciiWrite(this, string, offset, length)

        case 'latin1':
        case 'binary':
          return latin1Write(this, string, offset, length)

        case 'base64':
          // Warning: maxLength not taken into account in base64Write
          return base64Write(this, string, offset, length)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return ucs2Write(this, string, offset, length)

        default:
          if (loweredCase) { throw new TypeError('Unknown encoding: ' + encoding) }
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  };

  Buffer.prototype.toJSON = function toJSON () {
    return {
      type: 'Buffer',
      data: Array.prototype.slice.call(this._arr || this, 0)
    }
  };

  function base64Slice (buf, start, end) {
    if (start === 0 && end === buf.length) {
      return fromByteArray(buf)
    } else {
      return fromByteArray(buf.slice(start, end))
    }
  }

  function utf8Slice (buf, start, end) {
    end = Math.min(buf.length, end);
    var res = [];

    var i = start;
    while (i < end) {
      var firstByte = buf[i];
      var codePoint = null;
      var bytesPerSequence = (firstByte > 0xEF) ? 4
        : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
        : 1;

      if (i + bytesPerSequence <= end) {
        var secondByte, thirdByte, fourthByte, tempCodePoint;

        switch (bytesPerSequence) {
          case 1:
            if (firstByte < 0x80) {
              codePoint = firstByte;
            }
            break
          case 2:
            secondByte = buf[i + 1];
            if ((secondByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
              if (tempCodePoint > 0x7F) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 3:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
              if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 4:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            fourthByte = buf[i + 3];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
              if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
                codePoint = tempCodePoint;
              }
            }
        }
      }

      if (codePoint === null) {
        // we did not generate a valid codePoint so insert a
        // replacement char (U+FFFD) and advance only 1 byte
        codePoint = 0xFFFD;
        bytesPerSequence = 1;
      } else if (codePoint > 0xFFFF) {
        // encode to utf16 (surrogate pair dance)
        codePoint -= 0x10000;
        res.push(codePoint >>> 10 & 0x3FF | 0xD800);
        codePoint = 0xDC00 | codePoint & 0x3FF;
      }

      res.push(codePoint);
      i += bytesPerSequence;
    }

    return decodeCodePointsArray(res)
  }

  // Based on http://stackoverflow.com/a/22747272/680742, the browser with
  // the lowest limit is Chrome, with 0x10000 args.
  // We go 1 magnitude less, for safety
  var MAX_ARGUMENTS_LENGTH = 0x1000;

  function decodeCodePointsArray (codePoints) {
    var len = codePoints.length;
    if (len <= MAX_ARGUMENTS_LENGTH) {
      return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
    }

    // Decode in chunks to avoid "call stack size exceeded".
    var res = '';
    var i = 0;
    while (i < len) {
      res += String.fromCharCode.apply(
        String,
        codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
      );
    }
    return res
  }

  function asciiSlice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i] & 0x7F);
    }
    return ret
  }

  function latin1Slice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i]);
    }
    return ret
  }

  function hexSlice (buf, start, end) {
    var len = buf.length;

    if (!start || start < 0) { start = 0; }
    if (!end || end < 0 || end > len) { end = len; }

    var out = '';
    for (var i = start; i < end; ++i) {
      out += toHex(buf[i]);
    }
    return out
  }

  function utf16leSlice (buf, start, end) {
    var bytes = buf.slice(start, end);
    var res = '';
    for (var i = 0; i < bytes.length; i += 2) {
      res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
    }
    return res
  }

  Buffer.prototype.slice = function slice (start, end) {
    var len = this.length;
    start = ~~start;
    end = end === undefined ? len : ~~end;

    if (start < 0) {
      start += len;
      if (start < 0) { start = 0; }
    } else if (start > len) {
      start = len;
    }

    if (end < 0) {
      end += len;
      if (end < 0) { end = 0; }
    } else if (end > len) {
      end = len;
    }

    if (end < start) { end = start; }

    var newBuf;
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      newBuf = this.subarray(start, end);
      newBuf.__proto__ = Buffer.prototype;
    } else {
      var sliceLen = end - start;
      newBuf = new Buffer(sliceLen, undefined);
      for (var i = 0; i < sliceLen; ++i) {
        newBuf[i] = this[i + start];
      }
    }

    return newBuf
  };

  /*
   * Need to make sure that buffer isn't trying to write out of bounds.
   */
  function checkOffset (offset, ext, length) {
    if ((offset % 1) !== 0 || offset < 0) { throw new RangeError('offset is not uint') }
    if (offset + ext > length) { throw new RangeError('Trying to access beyond buffer length') }
  }

  Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) { checkOffset(offset, byteLength, this.length); }

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }

    return val
  };

  Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      checkOffset(offset, byteLength, this.length);
    }

    var val = this[offset + --byteLength];
    var mul = 1;
    while (byteLength > 0 && (mul *= 0x100)) {
      val += this[offset + --byteLength] * mul;
    }

    return val
  };

  Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 1, this.length); }
    return this[offset]
  };

  Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 2, this.length); }
    return this[offset] | (this[offset + 1] << 8)
  };

  Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 2, this.length); }
    return (this[offset] << 8) | this[offset + 1]
  };

  Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 4, this.length); }

    return ((this[offset]) |
        (this[offset + 1] << 8) |
        (this[offset + 2] << 16)) +
        (this[offset + 3] * 0x1000000)
  };

  Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 4, this.length); }

    return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
  };

  Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) { checkOffset(offset, byteLength, this.length); }

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) { val -= Math.pow(2, 8 * byteLength); }

    return val
  };

  Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) { checkOffset(offset, byteLength, this.length); }

    var i = byteLength;
    var mul = 1;
    var val = this[offset + --i];
    while (i > 0 && (mul *= 0x100)) {
      val += this[offset + --i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) { val -= Math.pow(2, 8 * byteLength); }

    return val
  };

  Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 1, this.length); }
    if (!(this[offset] & 0x80)) { return (this[offset]) }
    return ((0xff - this[offset] + 1) * -1)
  };

  Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 2, this.length); }
    var val = this[offset] | (this[offset + 1] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 2, this.length); }
    var val = this[offset + 1] | (this[offset] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 4, this.length); }

    return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
  };

  Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 4, this.length); }

    return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
  };

  Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 4, this.length); }
    return read(this, offset, true, 23, 4)
  };

  Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 4, this.length); }
    return read(this, offset, false, 23, 4)
  };

  Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 8, this.length); }
    return read(this, offset, true, 52, 8)
  };

  Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
    if (!noAssert) { checkOffset(offset, 8, this.length); }
    return read(this, offset, false, 52, 8)
  };

  function checkInt (buf, value, offset, ext, max, min) {
    if (!internalIsBuffer(buf)) { throw new TypeError('"buffer" argument must be a Buffer instance') }
    if (value > max || value < min) { throw new RangeError('"value" argument is out of bounds') }
    if (offset + ext > buf.length) { throw new RangeError('Index out of range') }
  }

  Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var mul = 1;
    var i = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var i = byteLength - 1;
    var mul = 1;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 1, 0xff, 0); }
    if (!Buffer.TYPED_ARRAY_SUPPORT) { value = Math.floor(value); }
    this[offset] = (value & 0xff);
    return offset + 1
  };

  function objectWriteUInt16 (buf, value, offset, littleEndian) {
    if (value < 0) { value = 0xffff + value + 1; }
    for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
      buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
        (littleEndian ? i : 1 - i) * 8;
    }
  }

  Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 2, 0xffff, 0); }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 2, 0xffff, 0); }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  function objectWriteUInt32 (buf, value, offset, littleEndian) {
    if (value < 0) { value = 0xffffffff + value + 1; }
    for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
      buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
    }
  }

  Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 4, 0xffffffff, 0); }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset + 3] = (value >>> 24);
      this[offset + 2] = (value >>> 16);
      this[offset + 1] = (value >>> 8);
      this[offset] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 4, 0xffffffff, 0); }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = 0;
    var mul = 1;
    var sub = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = byteLength - 1;
    var mul = 1;
    var sub = 0;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 1, 0x7f, -0x80); }
    if (!Buffer.TYPED_ARRAY_SUPPORT) { value = Math.floor(value); }
    if (value < 0) { value = 0xff + value + 1; }
    this[offset] = (value & 0xff);
    return offset + 1
  };

  Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 2, 0x7fff, -0x8000); }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 2, 0x7fff, -0x8000); }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000); }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
      this[offset + 2] = (value >>> 16);
      this[offset + 3] = (value >>> 24);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) { checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000); }
    if (value < 0) { value = 0xffffffff + value + 1; }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  function checkIEEE754 (buf, value, offset, ext, max, min) {
    if (offset + ext > buf.length) { throw new RangeError('Index out of range') }
    if (offset < 0) { throw new RangeError('Index out of range') }
  }

  function writeFloat (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38);
    }
    write(buf, value, offset, littleEndian, 23, 4);
    return offset + 4
  }

  Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
    return writeFloat(this, value, offset, true, noAssert)
  };

  Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
    return writeFloat(this, value, offset, false, noAssert)
  };

  function writeDouble (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308);
    }
    write(buf, value, offset, littleEndian, 52, 8);
    return offset + 8
  }

  Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
    return writeDouble(this, value, offset, true, noAssert)
  };

  Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
    return writeDouble(this, value, offset, false, noAssert)
  };

  // copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
  Buffer.prototype.copy = function copy (target, targetStart, start, end) {
    if (!start) { start = 0; }
    if (!end && end !== 0) { end = this.length; }
    if (targetStart >= target.length) { targetStart = target.length; }
    if (!targetStart) { targetStart = 0; }
    if (end > 0 && end < start) { end = start; }

    // Copy 0 bytes; we're done
    if (end === start) { return 0 }
    if (target.length === 0 || this.length === 0) { return 0 }

    // Fatal error conditions
    if (targetStart < 0) {
      throw new RangeError('targetStart out of bounds')
    }
    if (start < 0 || start >= this.length) { throw new RangeError('sourceStart out of bounds') }
    if (end < 0) { throw new RangeError('sourceEnd out of bounds') }

    // Are we oob?
    if (end > this.length) { end = this.length; }
    if (target.length - targetStart < end - start) {
      end = target.length - targetStart + start;
    }

    var len = end - start;
    var i;

    if (this === target && start < targetStart && targetStart < end) {
      // descending copy from end
      for (i = len - 1; i >= 0; --i) {
        target[i + targetStart] = this[i + start];
      }
    } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
      // ascending copy from start
      for (i = 0; i < len; ++i) {
        target[i + targetStart] = this[i + start];
      }
    } else {
      Uint8Array.prototype.set.call(
        target,
        this.subarray(start, start + len),
        targetStart
      );
    }

    return len
  };

  // Usage:
  //    buffer.fill(number[, offset[, end]])
  //    buffer.fill(buffer[, offset[, end]])
  //    buffer.fill(string[, offset[, end]][, encoding])
  Buffer.prototype.fill = function fill (val, start, end, encoding) {
    // Handle string cases:
    if (typeof val === 'string') {
      if (typeof start === 'string') {
        encoding = start;
        start = 0;
        end = this.length;
      } else if (typeof end === 'string') {
        encoding = end;
        end = this.length;
      }
      if (val.length === 1) {
        var code = val.charCodeAt(0);
        if (code < 256) {
          val = code;
        }
      }
      if (encoding !== undefined && typeof encoding !== 'string') {
        throw new TypeError('encoding must be a string')
      }
      if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
        throw new TypeError('Unknown encoding: ' + encoding)
      }
    } else if (typeof val === 'number') {
      val = val & 255;
    }

    // Invalid ranges are not set to a default, so can range check early.
    if (start < 0 || this.length < start || this.length < end) {
      throw new RangeError('Out of range index')
    }

    if (end <= start) {
      return this
    }

    start = start >>> 0;
    end = end === undefined ? this.length : end >>> 0;

    if (!val) { val = 0; }

    var i;
    if (typeof val === 'number') {
      for (i = start; i < end; ++i) {
        this[i] = val;
      }
    } else {
      var bytes = internalIsBuffer(val)
        ? val
        : utf8ToBytes(new Buffer(val, encoding).toString());
      var len = bytes.length;
      for (i = 0; i < end - start; ++i) {
        this[i + start] = bytes[i % len];
      }
    }

    return this
  };

  // HELPER FUNCTIONS
  // ================

  var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

  function base64clean (str) {
    // Node strips out invalid characters like \n and \t from the string, base64-js does not
    str = stringtrim(str).replace(INVALID_BASE64_RE, '');
    // Node converts strings with length < 2 to ''
    if (str.length < 2) { return '' }
    // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
    while (str.length % 4 !== 0) {
      str = str + '=';
    }
    return str
  }

  function stringtrim (str) {
    if (str.trim) { return str.trim() }
    return str.replace(/^\s+|\s+$/g, '')
  }

  function toHex (n) {
    if (n < 16) { return '0' + n.toString(16) }
    return n.toString(16)
  }

  function utf8ToBytes (string, units) {
    units = units || Infinity;
    var codePoint;
    var length = string.length;
    var leadSurrogate = null;
    var bytes = [];

    for (var i = 0; i < length; ++i) {
      codePoint = string.charCodeAt(i);

      // is surrogate component
      if (codePoint > 0xD7FF && codePoint < 0xE000) {
        // last char was a lead
        if (!leadSurrogate) {
          // no lead yet
          if (codePoint > 0xDBFF) {
            // unexpected trail
            if ((units -= 3) > -1) { bytes.push(0xEF, 0xBF, 0xBD); }
            continue
          } else if (i + 1 === length) {
            // unpaired lead
            if ((units -= 3) > -1) { bytes.push(0xEF, 0xBF, 0xBD); }
            continue
          }

          // valid lead
          leadSurrogate = codePoint;

          continue
        }

        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) { bytes.push(0xEF, 0xBF, 0xBD); }
          leadSurrogate = codePoint;
          continue
        }

        // valid surrogate pair
        codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
      } else if (leadSurrogate) {
        // valid bmp char, but last char was a lead
        if ((units -= 3) > -1) { bytes.push(0xEF, 0xBF, 0xBD); }
      }

      leadSurrogate = null;

      // encode utf8
      if (codePoint < 0x80) {
        if ((units -= 1) < 0) { break }
        bytes.push(codePoint);
      } else if (codePoint < 0x800) {
        if ((units -= 2) < 0) { break }
        bytes.push(
          codePoint >> 0x6 | 0xC0,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x10000) {
        if ((units -= 3) < 0) { break }
        bytes.push(
          codePoint >> 0xC | 0xE0,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x110000) {
        if ((units -= 4) < 0) { break }
        bytes.push(
          codePoint >> 0x12 | 0xF0,
          codePoint >> 0xC & 0x3F | 0x80,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else {
        throw new Error('Invalid code point')
      }
    }

    return bytes
  }

  function asciiToBytes (str) {
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      // Node's code seems to be doing this and not & 0x7F..
      byteArray.push(str.charCodeAt(i) & 0xFF);
    }
    return byteArray
  }

  function utf16leToBytes (str, units) {
    var c, hi, lo;
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      if ((units -= 2) < 0) { break }

      c = str.charCodeAt(i);
      hi = c >> 8;
      lo = c % 256;
      byteArray.push(lo);
      byteArray.push(hi);
    }

    return byteArray
  }


  function base64ToBytes (str) {
    return toByteArray(base64clean(str))
  }

  function blitBuffer (src, dst, offset, length) {
    for (var i = 0; i < length; ++i) {
      if ((i + offset >= dst.length) || (i >= src.length)) { break }
      dst[i + offset] = src[i];
    }
    return i
  }

  function isnan (val) {
    return val !== val // eslint-disable-line no-self-compare
  }


  // the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
  // The _isBuffer check is for Safari 5-7 support, because it's missing
  // Object.prototype.constructor. Remove this eventually
  function isBuffer(obj) {
    return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
  }

  function isFastBuffer (obj) {
    return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
  }

  // For Node v0.10 support. Remove this eventually.
  function isSlowBuffer (obj) {
    return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
  }

  if (typeof global$1.setTimeout === 'function') {
  }
  if (typeof global$1.clearTimeout === 'function') {
  }

  // from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
  var performance = global$1.performance || {};
  var performanceNow =
    performance.now        ||
    performance.mozNow     ||
    performance.msNow      ||
    performance.oNow       ||
    performance.webkitNow  ||
    function(){ return (new Date()).getTime() };

  function isNull(arg) {
    return arg === null;
  }

  function isNullOrUndefined(arg) {
    return arg == null;
  }

  function isString(arg) {
    return typeof arg === 'string';
  }

  function isObject(arg) {
    return typeof arg === 'object' && arg !== null;
  }

  // Copyright Joyent, Inc. and other Node contributors.
  //
  // Permission is hereby granted, free of charge, to any person obtaining a
  // copy of this software and associated documentation files (the
  // "Software"), to deal in the Software without restriction, including
  // without limitation the rights to use, copy, modify, merge, publish,
  // distribute, sublicense, and/or sell copies of the Software, and to permit
  // persons to whom the Software is furnished to do so, subject to the
  // following conditions:
  //
  // The above copyright notice and this permission notice shall be included
  // in all copies or substantial portions of the Software.
  //
  // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  // OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  // MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
  // NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
  // DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  // OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
  // USE OR OTHER DEALINGS IN THE SOFTWARE.


  // If obj.hasOwnProperty has been overridden, then calling
  // obj.hasOwnProperty(prop) will break.
  // See: https://github.com/joyent/node/issues/1707
  function hasOwnProperty$1(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }
  var isArray$2 = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
  };
  function stringifyPrimitive(v) {
    switch (typeof v) {
      case 'string':
        return v;

      case 'boolean':
        return v ? 'true' : 'false';

      case 'number':
        return isFinite(v) ? v : '';

      default:
        return '';
    }
  }

  function stringify (obj, sep, eq, name) {
    sep = sep || '&';
    eq = eq || '=';
    if (obj === null) {
      obj = undefined;
    }

    if (typeof obj === 'object') {
      return map$1(objectKeys(obj), function(k) {
        var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
        if (isArray$2(obj[k])) {
          return map$1(obj[k], function(v) {
            return ks + encodeURIComponent(stringifyPrimitive(v));
          }).join(sep);
        } else {
          return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
        }
      }).join(sep);

    }

    if (!name) { return ''; }
    return encodeURIComponent(stringifyPrimitive(name)) + eq +
           encodeURIComponent(stringifyPrimitive(obj));
  }
  function map$1 (xs, f) {
    if (xs.map) { return xs.map(f); }
    var res = [];
    for (var i = 0; i < xs.length; i++) {
      res.push(f(xs[i], i));
    }
    return res;
  }

  var objectKeys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) { res.push(key); }
    }
    return res;
  };

  function parse(qs, sep, eq, options) {
    sep = sep || '&';
    eq = eq || '=';
    var obj = {};

    if (typeof qs !== 'string' || qs.length === 0) {
      return obj;
    }

    var regexp = /\+/g;
    qs = qs.split(sep);

    var maxKeys = 1000;
    if (options && typeof options.maxKeys === 'number') {
      maxKeys = options.maxKeys;
    }

    var len = qs.length;
    // maxKeys <= 0 means that we should not limit keys count
    if (maxKeys > 0 && len > maxKeys) {
      len = maxKeys;
    }

    for (var i = 0; i < len; ++i) {
      var x = qs[i].replace(regexp, '%20'),
          idx = x.indexOf(eq),
          kstr, vstr, k, v;

      if (idx >= 0) {
        kstr = x.substr(0, idx);
        vstr = x.substr(idx + 1);
      } else {
        kstr = x;
        vstr = '';
      }

      k = decodeURIComponent(kstr);
      v = decodeURIComponent(vstr);

      if (!hasOwnProperty$1(obj, k)) {
        obj[k] = v;
      } else if (isArray$2(obj[k])) {
        obj[k].push(v);
      } else {
        obj[k] = [obj[k], v];
      }
    }

    return obj;
  }

  // Copyright Joyent, Inc. and other Node contributors.
  function Url() {
    this.protocol = null;
    this.slashes = null;
    this.auth = null;
    this.host = null;
    this.port = null;
    this.hostname = null;
    this.hash = null;
    this.search = null;
    this.query = null;
    this.pathname = null;
    this.path = null;
    this.href = null;
  }

  // Reference: RFC 3986, RFC 1808, RFC 2396

  // define these here so at least they only have to be
  // compiled once on the first module load.
  var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    };

  function urlParse(url, parseQueryString, slashesDenoteHost) {
    if (url && isObject(url) && url instanceof Url) { return url; }

    var u = new Url;
    u.parse(url, parseQueryString, slashesDenoteHost);
    return u;
  }
  Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
    return parse$1(this, url, parseQueryString, slashesDenoteHost);
  };

  function parse$1(self, url, parseQueryString, slashesDenoteHost) {
    if (!isString(url)) {
      throw new TypeError('Parameter \'url\' must be a string, not ' + typeof url);
    }

    // Copy chrome, IE, opera backslash-handling behavior.
    // Back slashes before the query string get converted to forward slashes
    // See: https://code.google.com/p/chromium/issues/detail?id=25916
    var queryIndex = url.indexOf('?'),
      splitter =
      (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
    uSplit[0] = uSplit[0].replace(slashRegex, '/');
    url = uSplit.join(splitter);

    var rest = url;

    // trim before proceeding.
    // This is to support parse stuff like "  http://foo.com  \n"
    rest = rest.trim();

    if (!slashesDenoteHost && url.split('#').length === 1) {
      // Try fast path regexp
      var simplePath = simplePathPattern.exec(rest);
      if (simplePath) {
        self.path = rest;
        self.href = rest;
        self.pathname = simplePath[1];
        if (simplePath[2]) {
          self.search = simplePath[2];
          if (parseQueryString) {
            self.query = parse(self.search.substr(1));
          } else {
            self.query = self.search.substr(1);
          }
        } else if (parseQueryString) {
          self.search = '';
          self.query = {};
        }
        return self;
      }
    }

    var proto = protocolPattern.exec(rest);
    if (proto) {
      proto = proto[0];
      var lowerProto = proto.toLowerCase();
      self.protocol = lowerProto;
      rest = rest.substr(proto.length);
    }

    // figure out if it's got a host
    // user@server is *always* interpreted as a hostname, and url
    // resolution will treat //foo/bar as host=foo,path=bar because that's
    // how the browser resolves relative URLs.
    if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
      var slashes = rest.substr(0, 2) === '//';
      if (slashes && !(proto && hostlessProtocol[proto])) {
        rest = rest.substr(2);
        self.slashes = true;
      }
    }
    var i, hec, l, p;
    if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

      // there's a hostname.
      // the first instance of /, ?, ;, or # ends the host.
      //
      // If there is an @ in the hostname, then non-host chars *are* allowed
      // to the left of the last @ sign, unless some host-ending character
      // comes *before* the @-sign.
      // URLs are obnoxious.
      //
      // ex:
      // http://a@b@c/ => user:a@b host:c
      // http://a@b?@c => user:a host:c path:/?@c

      // v0.12 TODO(isaacs): This is not quite how Chrome does things.
      // Review our test case against browsers more comprehensively.

      // find the first instance of any hostEndingChars
      var hostEnd = -1;
      for (i = 0; i < hostEndingChars.length; i++) {
        hec = rest.indexOf(hostEndingChars[i]);
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
          { hostEnd = hec; }
      }

      // at this point, either we have an explicit point where the
      // auth portion cannot go past, or the last @ char is the decider.
      var auth, atSign;
      if (hostEnd === -1) {
        // atSign can be anywhere.
        atSign = rest.lastIndexOf('@');
      } else {
        // atSign must be in auth portion.
        // http://a@b/c@d => host:b auth:a path:/c@d
        atSign = rest.lastIndexOf('@', hostEnd);
      }

      // Now we have a portion which is definitely the auth.
      // Pull that off.
      if (atSign !== -1) {
        auth = rest.slice(0, atSign);
        rest = rest.slice(atSign + 1);
        self.auth = decodeURIComponent(auth);
      }

      // the host is the remaining to the left of the first non-host char
      hostEnd = -1;
      for (i = 0; i < nonHostChars.length; i++) {
        hec = rest.indexOf(nonHostChars[i]);
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
          { hostEnd = hec; }
      }
      // if we still have not hit it, then the entire thing is a host.
      if (hostEnd === -1)
        { hostEnd = rest.length; }

      self.host = rest.slice(0, hostEnd);
      rest = rest.slice(hostEnd);

      // pull out port.
      parseHost(self);

      // we've indicated that there is a hostname,
      // so even if it's empty, it has to be present.
      self.hostname = self.hostname || '';

      // if hostname begins with [ and ends with ]
      // assume that it's an IPv6 address.
      var ipv6Hostname = self.hostname[0] === '[' &&
        self.hostname[self.hostname.length - 1] === ']';

      // validate a little.
      if (!ipv6Hostname) {
        var hostparts = self.hostname.split(/\./);
        for (i = 0, l = hostparts.length; i < l; i++) {
          var part = hostparts[i];
          if (!part) { continue; }
          if (!part.match(hostnamePartPattern)) {
            var newpart = '';
            for (var j = 0, k = part.length; j < k; j++) {
              if (part.charCodeAt(j) > 127) {
                // we replace non-ASCII char with a temporary placeholder
                // we need this to make sure size of hostname is not
                // broken by replacing non-ASCII by nothing
                newpart += 'x';
              } else {
                newpart += part[j];
              }
            }
            // we test again with ASCII char only
            if (!newpart.match(hostnamePartPattern)) {
              var validParts = hostparts.slice(0, i);
              var notHost = hostparts.slice(i + 1);
              var bit = part.match(hostnamePartStart);
              if (bit) {
                validParts.push(bit[1]);
                notHost.unshift(bit[2]);
              }
              if (notHost.length) {
                rest = '/' + notHost.join('.') + rest;
              }
              self.hostname = validParts.join('.');
              break;
            }
          }
        }
      }

      if (self.hostname.length > hostnameMaxLen) {
        self.hostname = '';
      } else {
        // hostnames are always lower case.
        self.hostname = self.hostname.toLowerCase();
      }

      if (!ipv6Hostname) {
        // IDNA Support: Returns a punycoded representation of "domain".
        // It only converts parts of the domain name that
        // have non-ASCII characters, i.e. it doesn't matter if
        // you call it with a domain that already is ASCII-only.
        self.hostname = toASCII(self.hostname);
      }

      p = self.port ? ':' + self.port : '';
      var h = self.hostname || '';
      self.host = h + p;
      self.href += self.host;

      // strip [ and ] from the hostname
      // the host field still retains them, though
      if (ipv6Hostname) {
        self.hostname = self.hostname.substr(1, self.hostname.length - 2);
        if (rest[0] !== '/') {
          rest = '/' + rest;
        }
      }
    }

    // now rest is set to the post-host stuff.
    // chop off any delim chars.
    if (!unsafeProtocol[lowerProto]) {

      // First, make 100% sure that any "autoEscape" chars get
      // escaped, even if encodeURIComponent doesn't think they
      // need to be.
      for (i = 0, l = autoEscape.length; i < l; i++) {
        var ae = autoEscape[i];
        if (rest.indexOf(ae) === -1)
          { continue; }
        var esc = encodeURIComponent(ae);
        if (esc === ae) {
          esc = escape(ae);
        }
        rest = rest.split(ae).join(esc);
      }
    }


    // chop off from the tail first.
    var hash = rest.indexOf('#');
    if (hash !== -1) {
      // got a fragment string.
      self.hash = rest.substr(hash);
      rest = rest.slice(0, hash);
    }
    var qm = rest.indexOf('?');
    if (qm !== -1) {
      self.search = rest.substr(qm);
      self.query = rest.substr(qm + 1);
      if (parseQueryString) {
        self.query = parse(self.query);
      }
      rest = rest.slice(0, qm);
    } else if (parseQueryString) {
      // no query string, but parseQueryString still requested
      self.search = '';
      self.query = {};
    }
    if (rest) { self.pathname = rest; }
    if (slashedProtocol[lowerProto] &&
      self.hostname && !self.pathname) {
      self.pathname = '/';
    }

    //to support http.request
    if (self.pathname || self.search) {
      p = self.pathname || '';
      var s = self.search || '';
      self.path = p + s;
    }

    // finally, reconstruct the href based on what has been validated.
    self.href = format$1(self);
    return self;
  }

  function format$1(self) {
    var auth = self.auth || '';
    if (auth) {
      auth = encodeURIComponent(auth);
      auth = auth.replace(/%3A/i, ':');
      auth += '@';
    }

    var protocol = self.protocol || '',
      pathname = self.pathname || '',
      hash = self.hash || '',
      host = false,
      query = '';

    if (self.host) {
      host = auth + self.host;
    } else if (self.hostname) {
      host = auth + (self.hostname.indexOf(':') === -1 ?
        self.hostname :
        '[' + this.hostname + ']');
      if (self.port) {
        host += ':' + self.port;
      }
    }

    if (self.query &&
      isObject(self.query) &&
      Object.keys(self.query).length) {
      query = stringify(self.query);
    }

    var search = self.search || (query && ('?' + query)) || '';

    if (protocol && protocol.substr(-1) !== ':') { protocol += ':'; }

    // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
    // unless they had them to begin with.
    if (self.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
      host = '//' + (host || '');
      if (pathname && pathname.charAt(0) !== '/') { pathname = '/' + pathname; }
    } else if (!host) {
      host = '';
    }

    if (hash && hash.charAt(0) !== '#') { hash = '#' + hash; }
    if (search && search.charAt(0) !== '?') { search = '?' + search; }

    pathname = pathname.replace(/[?#]/g, function(match) {
      return encodeURIComponent(match);
    });
    search = search.replace('#', '%23');

    return protocol + host + pathname + search + hash;
  }

  Url.prototype.format = function() {
    return format$1(this);
  };

  Url.prototype.resolve = function(relative) {
    return this.resolveObject(urlParse(relative, false, true)).format();
  };

  Url.prototype.resolveObject = function(relative) {
    if (isString(relative)) {
      var rel = new Url();
      rel.parse(relative, false, true);
      relative = rel;
    }

    var result = new Url();
    var tkeys = Object.keys(this);
    for (var tk = 0; tk < tkeys.length; tk++) {
      var tkey = tkeys[tk];
      result[tkey] = this[tkey];
    }

    // hash is always overridden, no matter what.
    // even href="" will remove it.
    result.hash = relative.hash;

    // if the relative url is empty, then there's nothing left to do here.
    if (relative.href === '') {
      result.href = result.format();
      return result;
    }

    // hrefs like //foo/bar always cut to the protocol.
    if (relative.slashes && !relative.protocol) {
      // take everything except the protocol from relative
      var rkeys = Object.keys(relative);
      for (var rk = 0; rk < rkeys.length; rk++) {
        var rkey = rkeys[rk];
        if (rkey !== 'protocol')
          { result[rkey] = relative[rkey]; }
      }

      //urlParse appends trailing / to urls like http://www.example.com
      if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
        result.path = result.pathname = '/';
      }

      result.href = result.format();
      return result;
    }
    var relPath;
    if (relative.protocol && relative.protocol !== result.protocol) {
      // if it's a known url protocol, then changing
      // the protocol does weird things
      // first, if it's not file:, then we MUST have a host,
      // and if there was a path
      // to begin with, then we MUST have a path.
      // if it is file:, then the host is dropped,
      // because that's known to be hostless.
      // anything else is assumed to be absolute.
      if (!slashedProtocol[relative.protocol]) {
        var keys = Object.keys(relative);
        for (var v = 0; v < keys.length; v++) {
          var k = keys[v];
          result[k] = relative[k];
        }
        result.href = result.format();
        return result;
      }

      result.protocol = relative.protocol;
      if (!relative.host && !hostlessProtocol[relative.protocol]) {
        relPath = (relative.pathname || '').split('/');
        while (relPath.length && !(relative.host = relPath.shift())){ }
        if (!relative.host) { relative.host = ''; }
        if (!relative.hostname) { relative.hostname = ''; }
        if (relPath[0] !== '') { relPath.unshift(''); }
        if (relPath.length < 2) { relPath.unshift(''); }
        result.pathname = relPath.join('/');
      } else {
        result.pathname = relative.pathname;
      }
      result.search = relative.search;
      result.query = relative.query;
      result.host = relative.host || '';
      result.auth = relative.auth;
      result.hostname = relative.hostname || relative.host;
      result.port = relative.port;
      // to support http.request
      if (result.pathname || result.search) {
        var p = result.pathname || '';
        var s = result.search || '';
        result.path = p + s;
      }
      result.slashes = result.slashes || relative.slashes;
      result.href = result.format();
      return result;
    }

    var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
        relative.host ||
        relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
        (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];
    relPath = relative.pathname && relative.pathname.split('/') || [];
    // if the url is a non-slashed url, then relative
    // links like ../.. should be able
    // to crawl up to the hostname, as well.  This is strange.
    // result.protocol has already been set by now.
    // Later on, put the first path part into the host field.
    if (psychotic) {
      result.hostname = '';
      result.port = null;
      if (result.host) {
        if (srcPath[0] === '') { srcPath[0] = result.host; }
        else { srcPath.unshift(result.host); }
      }
      result.host = '';
      if (relative.protocol) {
        relative.hostname = null;
        relative.port = null;
        if (relative.host) {
          if (relPath[0] === '') { relPath[0] = relative.host; }
          else { relPath.unshift(relative.host); }
        }
        relative.host = null;
      }
      mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
    }
    var authInHost;
    if (isRelAbs) {
      // it's absolute.
      result.host = (relative.host || relative.host === '') ?
        relative.host : result.host;
      result.hostname = (relative.hostname || relative.hostname === '') ?
        relative.hostname : result.hostname;
      result.search = relative.search;
      result.query = relative.query;
      srcPath = relPath;
      // fall through to the dot-handling below.
    } else if (relPath.length) {
      // it's relative
      // throw away the existing file, and take the new path instead.
      if (!srcPath) { srcPath = []; }
      srcPath.pop();
      srcPath = srcPath.concat(relPath);
      result.search = relative.search;
      result.query = relative.query;
    } else if (!isNullOrUndefined(relative.search)) {
      // just pull out the search.
      // like href='?foo'.
      // Put this after the other two cases because it simplifies the booleans
      if (psychotic) {
        result.hostname = result.host = srcPath.shift();
        //occationaly the auth can get stuck only in host
        //this especially happens in cases like
        //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
        authInHost = result.host && result.host.indexOf('@') > 0 ?
          result.host.split('@') : false;
        if (authInHost) {
          result.auth = authInHost.shift();
          result.host = result.hostname = authInHost.shift();
        }
      }
      result.search = relative.search;
      result.query = relative.query;
      //to support http.request
      if (!isNull(result.pathname) || !isNull(result.search)) {
        result.path = (result.pathname ? result.pathname : '') +
          (result.search ? result.search : '');
      }
      result.href = result.format();
      return result;
    }

    if (!srcPath.length) {
      // no path at all.  easy.
      // we've already handled the other stuff above.
      result.pathname = null;
      //to support http.request
      if (result.search) {
        result.path = '/' + result.search;
      } else {
        result.path = null;
      }
      result.href = result.format();
      return result;
    }

    // if a url ENDs in . or .., then it must get a trailing slash.
    // however, if it ends in anything else non-slashy,
    // then it must NOT get a trailing slash.
    var last = srcPath.slice(-1)[0];
    var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

    // strip single dots, resolve double dots to parent dir
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = srcPath.length; i >= 0; i--) {
      last = srcPath[i];
      if (last === '.') {
        srcPath.splice(i, 1);
      } else if (last === '..') {
        srcPath.splice(i, 1);
        up++;
      } else if (up) {
        srcPath.splice(i, 1);
        up--;
      }
    }

    // if the path is allowed to go above the root, restore leading ..s
    if (!mustEndAbs && !removeAllDots) {
      for (; up--; up) {
        srcPath.unshift('..');
      }
    }

    if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
      srcPath.unshift('');
    }

    if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
      srcPath.push('');
    }

    var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

    // put the host back
    if (psychotic) {
      result.hostname = result.host = isAbsolute ? '' :
        srcPath.length ? srcPath.shift() : '';
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      authInHost = result.host && result.host.indexOf('@') > 0 ?
        result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }

    mustEndAbs = mustEndAbs || (result.host && srcPath.length);

    if (mustEndAbs && !isAbsolute) {
      srcPath.unshift('');
    }

    if (!srcPath.length) {
      result.pathname = null;
      result.path = null;
    } else {
      result.pathname = srcPath.join('/');
    }

    //to support request.http
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
        (result.search ? result.search : '');
    }
    result.auth = relative.auth || result.auth;
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  };

  Url.prototype.parseHost = function() {
    return parseHost(this);
  };

  function parseHost(self) {
    var host = self.host;
    var port = portPattern.exec(host);
    if (port) {
      port = port[0];
      if (port !== ':') {
        self.port = port.substr(1);
      }
      host = host.substr(0, host.length - port.length);
    }
    if (host) { self.hostname = host; }
  }

  var Router = function Router(opts) {
    var config = this.config = opts.config;
    this.store = opts.store;
    this.controller = opts.controller;
    this.dataManager = opts.dataManager;
    this.history = window.history;

    // check if the router should be silent (i.e. not update the url or listen
    // for hash changes)
    var silent = this.silent = !config.router || !config.router.enabled;

    // only listen for route changes if routing is enabled
    if (!silent) {
      window.onhashchange = this.hashChanged.bind(this);
    }
  };

  Router.prototype.makeHash = function makeHash (address) {
    // console.log('make hash', address);

    // must have an address
    if (!address || address.length === 0) {
      return null;
    }
    var hash = "#/" + (encodeURIComponent(address));
    return hash;
  };

  Router.prototype.getAddressFromState = function getAddressFromState () {
    // TODO add an address getter fn to config so this isn't ais-specific
    var geocodeData = this.store.state.geocode.data || {};
    var props = geocodeData.properties || {};
    if (geocodeData.street_address) {
      return geocodeData.street_address;
    } else if (props.street_address) {
      return props.street_address;
    }
  };

  Router.prototype.hashChanged = function hashChanged () {
    var location = window.location;
    var hash = location.hash;

    // parse url
    var comps = urlParse(location.href);
    var query = comps.query;

    // TODO handle ?search entry point
    // if (query && query.search) {
    // }

    // parse path
    var pathComps = hash.split('/').splice(1);
    var addressComp = pathComps[0];

    // if there's no address, erase it
    if (!addressComp) {
      this.routeToModal('');
      this.dataManager.resetGeocode();
      return;
    }

    var modalKeys = this.config.modals || [];
    // console.log('pathComps:', pathComps, 'modalKeys:', modalKeys);
    if (modalKeys.includes(pathComps[0])) {
      // console.log('if pathComps[0] is true');
      this.routeToModal(pathComps[0]);
      return;
    }

    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }
  };

  Router.prototype.routeToAddress = function routeToAddress (nextAddress, searchCategory) {
    // console.log('Router.routeToAddress', nextAddress);
    if (nextAddress) {
      // check against current address
      var prevAddress = this.getAddressFromState();

      // if the hash address is different, geocode
      if (!prevAddress || nextAddress !== prevAddress) {
        // console.log('routeToAddress is calling datamanager.geocode(nextAddress):', nextAddress);
        this.dataManager.geocode(nextAddress, searchCategory);
        // this.dataManager.geocode(nextAddress, 'address')
                        // .then(this.didGeocode.bind(this));
      }
    }
  };

  Router.prototype.routeToOwner = function routeToOwner (nextOwner, searchCategory) {
    console.log('Router.routeToOwner', nextOwner);
    if (nextOwner) {
      // check against current address
      // const prevOwner = this.getAddressFromState();

      // if the hash address is different, geocode
      // if (!prevAddress || nextAddress !== prevAddress) {
        // console.log('routeToAddress is calling datamanager.geocode(nextAddress):', nextAddress);
        this.dataManager.geocode(nextOwner, searchCategory);
        console.log(this.dataManager.geocode(nextOwner, searchCategory));
        // this.dataManager.geocode(nextOwner, 'owner')
                        // .then(this.didGeocode.bind(this));
      // }
    }
  };

  Router.prototype.configForBasemap = function configForBasemap (key) {
    return this.config.map.basemaps[key];
  };

  Router.prototype.routeToModal = function routeToModal (selectedModal) {
    // console.log('routeToModal is running, selectedModal:', selectedModal);
    this.store.commit('setDidToggleModal', selectedModal);
  };

  Router.prototype.didGeocode = function didGeocode () {
    var geocodeData = this.store.state.geocode.data;

    // make hash if there is geocode data
    // console.log('Router.didGeocode running - geocodeData:', geocodeData);
    if (geocodeData) {
      var address;

      if (geocodeData.street_address) {
        address = geocodeData.street_address;
      } else if (geocodeData.properties.street_address) {
        address = geocodeData.properties.street_address;
      }

      // REVIEW this is only pushing state when routing is turned on. but maybe we
      // want this to happen all the time, right?
      if (!this.silent) {
        // push state
        var nextHistoryState = {
          geocode: geocodeData
        };
        var nextHash = this.makeHash(address);
        // console.log('nextHistoryState', nextHistoryState, 'nextHash', nextHash);
        this.history.pushState(nextHistoryState, null, nextHash);
      }
    } else {
      // wipe out hash if a geocode fails
      if (!this.silent) {
        this.history.pushState(null, null, '#');
      }
    }
  };

  /**
   * Earth Radius used with the Harvesine formula and approximates using a spherical (non-ellipsoid) Earth.
   */
  var earthRadius = 6371008.8;

  /**
   * Unit of measurement factors using a spherical (non-ellipsoid) earth radius.
   */
  var factors = {
      meters: earthRadius,
      metres: earthRadius,
      millimeters: earthRadius * 1000,
      millimetres: earthRadius * 1000,
      centimeters: earthRadius * 100,
      centimetres: earthRadius * 100,
      kilometers: earthRadius / 1000,
      kilometres: earthRadius / 1000,
      miles: earthRadius / 1609.344,
      nauticalmiles: earthRadius / 1852,
      inches: earthRadius * 39.370,
      yards: earthRadius / 1.0936,
      feet: earthRadius * 3.28084,
      radians: 1,
      degrees: earthRadius / 111325,
  };

  /**
   * Wraps a GeoJSON {@link Geometry} in a GeoJSON {@link Feature}.
   *
   * @name feature
   * @param {Geometry} geometry input geometry
   * @param {Object} [properties={}] an Object of key-value pairs to add as properties
   * @param {Object} [options={}] Optional Parameters
   * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
   * @param {string|number} [options.id] Identifier associated with the Feature
   * @returns {Feature} a GeoJSON Feature
   * @example
   * var geometry = {
   *   "type": "Point",
   *   "coordinates": [110, 50]
   * };
   *
   * var feature = turf.feature(geometry);
   *
   * //=feature
   */
  function feature(geometry, properties, options) {
      // Optional Parameters
      options = options || {};
      if (!isObject$1(options)) { throw new Error('options is invalid'); }
      var bbox = options.bbox;
      var id = options.id;

      // Validation
      if (geometry === undefined) { throw new Error('geometry is required'); }
      if (properties && properties.constructor !== Object) { throw new Error('properties must be an Object'); }
      if (bbox) { validateBBox(bbox); }
      if (id) { validateId(id); }

      // Main
      var feat = {type: 'Feature'};
      if (id) { feat.id = id; }
      if (bbox) { feat.bbox = bbox; }
      feat.properties = properties || {};
      feat.geometry = geometry;
      return feat;
  }

  /**
   * Creates a {@link Point} {@link Feature} from a Position.
   *
   * @name point
   * @param {Array<number>} coordinates longitude, latitude position (each in decimal degrees)
   * @param {Object} [properties={}] an Object of key-value pairs to add as properties
   * @param {Object} [options={}] Optional Parameters
   * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
   * @param {string|number} [options.id] Identifier associated with the Feature
   * @returns {Feature<Point>} a Point feature
   * @example
   * var point = turf.point([-75.343, 39.984]);
   *
   * //=point
   */
  function point(coordinates, properties, options) {
      if (!coordinates) { throw new Error('coordinates is required'); }
      if (!Array.isArray(coordinates)) { throw new Error('coordinates must be an Array'); }
      if (coordinates.length < 2) { throw new Error('coordinates must be at least 2 numbers long'); }
      if (!isNumber$1(coordinates[0]) || !isNumber$1(coordinates[1])) { throw new Error('coordinates must contain numbers'); }

      return feature({
          type: 'Point',
          coordinates: coordinates
      }, properties, options);
  }

  /**
   * Creates a {@link Polygon} {@link Feature} from an Array of LinearRings.
   *
   * @name polygon
   * @param {Array<Array<Array<number>>>} coordinates an array of LinearRings
   * @param {Object} [properties={}] an Object of key-value pairs to add as properties
   * @param {Object} [options={}] Optional Parameters
   * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
   * @param {string|number} [options.id] Identifier associated with the Feature
   * @returns {Feature<Polygon>} Polygon Feature
   * @example
   * var polygon = turf.polygon([[[-5, 52], [-4, 56], [-2, 51], [-7, 54], [-5, 52]]], { name: 'poly1' });
   *
   * //=polygon
   */
  function polygon(coordinates, properties, options) {
      if (!coordinates) { throw new Error('coordinates is required'); }

      for (var i = 0; i < coordinates.length; i++) {
          var ring = coordinates[i];
          if (ring.length < 4) {
              throw new Error('Each LinearRing of a Polygon must have 4 or more Positions.');
          }
          for (var j = 0; j < ring[ring.length - 1].length; j++) {
              // Check if first point of Polygon contains two numbers
              if (i === 0 && j === 0 && !isNumber$1(ring[0][0]) || !isNumber$1(ring[0][1])) { throw new Error('coordinates must contain numbers'); }
              if (ring[ring.length - 1][j] !== ring[0][j]) {
                  throw new Error('First and last Position are not equivalent.');
              }
          }
      }

      return feature({
          type: 'Polygon',
          coordinates: coordinates
      }, properties, options);
  }

  /**
   * Takes one or more {@link Feature|Features} and creates a {@link FeatureCollection}.
   *
   * @name featureCollection
   * @param {Feature[]} features input features
   * @param {Object} [options={}] Optional Parameters
   * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
   * @param {string|number} [options.id] Identifier associated with the Feature
   * @returns {FeatureCollection} FeatureCollection of Features
   * @example
   * var locationA = turf.point([-75.343, 39.984], {name: 'Location A'});
   * var locationB = turf.point([-75.833, 39.284], {name: 'Location B'});
   * var locationC = turf.point([-75.534, 39.123], {name: 'Location C'});
   *
   * var collection = turf.featureCollection([
   *   locationA,
   *   locationB,
   *   locationC
   * ]);
   *
   * //=collection
   */
  function featureCollection(features, options) {
      // Optional Parameters
      options = options || {};
      if (!isObject$1(options)) { throw new Error('options is invalid'); }
      var bbox = options.bbox;
      var id = options.id;

      // Validation
      if (!features) { throw new Error('No features passed'); }
      if (!Array.isArray(features)) { throw new Error('features must be an Array'); }
      if (bbox) { validateBBox(bbox); }
      if (id) { validateId(id); }

      // Main
      var fc = {type: 'FeatureCollection'};
      if (id) { fc.id = id; }
      if (bbox) { fc.bbox = bbox; }
      fc.features = features;
      return fc;
  }

  /**
   * Convert a distance measurement (assuming a spherical Earth) from radians to a more friendly unit.
   * Valid units: miles, nauticalmiles, inches, yards, meters, metres, kilometers, centimeters, feet
   *
   * @name radiansToLength
   * @param {number} radians in radians across the sphere
   * @param {string} [units='kilometers'] can be degrees, radians, miles, or kilometers inches, yards, metres, meters, kilometres, kilometers.
   * @returns {number} distance
   */
  function radiansToLength(radians, units) {
      if (radians === undefined || radians === null) { throw new Error('radians is required'); }

      if (units && typeof units !== 'string') { throw new Error('units must be a string'); }
      var factor = factors[units || 'kilometers'];
      if (!factor) { throw new Error(units + ' units is invalid'); }
      return radians * factor;
  }

  /**
   * Converts an angle in degrees to radians
   *
   * @name degreesToRadians
   * @param {number} degrees angle between 0 and 360 degrees
   * @returns {number} angle in radians
   */
  function degreesToRadians(degrees) {
      if (degrees === null || degrees === undefined) { throw new Error('degrees is required'); }

      var radians = degrees % 360;
      return radians * Math.PI / 180;
  }

  /**
   * isNumber
   *
   * @param {*} num Number to validate
   * @returns {boolean} true/false
   * @example
   * turf.isNumber(123)
   * //=true
   * turf.isNumber('foo')
   * //=false
   */
  function isNumber$1(num) {
      return !isNaN(num) && num !== null && !Array.isArray(num);
  }

  /**
   * isObject
   *
   * @param {*} input variable to validate
   * @returns {boolean} true/false
   * @example
   * turf.isObject({elevation: 10})
   * //=true
   * turf.isObject('foo')
   * //=false
   */
  function isObject$1(input) {
      return (!!input) && (input.constructor === Object);
  }

  /**
   * Validate BBox
   *
   * @private
   * @param {Array<number>} bbox BBox to validate
   * @returns {void}
   * @throws Error if BBox is not valid
   * @example
   * validateBBox([-180, -40, 110, 50])
   * //=OK
   * validateBBox([-180, -40])
   * //=Error
   * validateBBox('Foo')
   * //=Error
   * validateBBox(5)
   * //=Error
   * validateBBox(null)
   * //=Error
   * validateBBox(undefined)
   * //=Error
   */
  function validateBBox(bbox) {
      if (!bbox) { throw new Error('bbox is required'); }
      if (!Array.isArray(bbox)) { throw new Error('bbox must be an Array'); }
      if (bbox.length !== 4 && bbox.length !== 6) { throw new Error('bbox must be an Array of 4 or 6 numbers'); }
      bbox.forEach(function (num) {
          if (!isNumber$1(num)) { throw new Error('bbox must only contain numbers'); }
      });
  }

  /**
   * Validate Id
   *
   * @private
   * @param {string|number} id Id to validate
   * @returns {void}
   * @throws Error if Id is not valid
   * @example
   * validateId([-180, -40, 110, 50])
   * //=Error
   * validateId([-180, -40])
   * //=Error
   * validateId('Foo')
   * //=OK
   * validateId(5)
   * //=OK
   * validateId(null)
   * //=Error
   * validateId(undefined)
   * //=Error
   */
  function validateId(id) {
      if (!id) { throw new Error('id is required'); }
      if (['string', 'number'].indexOf(typeof id) === -1) { throw new Error('id must be a number or a string'); }
  }

  /**
   * Unwrap a coordinate from a Point Feature, Geometry or a single coordinate.
   *
   * @name getCoord
   * @param {Array<number>|Geometry<Point>|Feature<Point>} coord GeoJSON Point or an Array of numbers
   * @returns {Array<number>} coordinates
   * @example
   * var pt = turf.point([10, 10]);
   *
   * var coord = turf.getCoord(pt);
   * //= [10, 10]
   */
  function getCoord(coord) {
      if (!coord) { throw new Error('coord is required'); }
      if (coord.type === 'Feature' && coord.geometry !== null && coord.geometry.type === 'Point') { return coord.geometry.coordinates; }
      if (coord.type === 'Point') { return coord.coordinates; }
      if (Array.isArray(coord) && coord.length >= 2 && coord[0].length === undefined && coord[1].length === undefined) { return coord; }

      throw new Error('coord must be GeoJSON Point or an Array of numbers');
  }

  //http://en.wikipedia.org/wiki/Haversine_formula
  //http://www.movable-type.co.uk/scripts/latlong.html

  /**
   * Calculates the distance between two {@link Point|points} in degrees, radians,
   * miles, or kilometers. This uses the
   * [Haversine formula](http://en.wikipedia.org/wiki/Haversine_formula)
   * to account for global curvature.
   *
   * @name distance
   * @param {Coord} from origin point
   * @param {Coord} to destination point
   * @param {Object} [options={}] Optional parameters
   * @param {string} [options.units='kilometers'] can be degrees, radians, miles, or kilometers
   * @returns {number} distance between the two points
   * @example
   * var from = turf.point([-75.343, 39.984]);
   * var to = turf.point([-75.534, 39.123]);
   * var options = {units: 'miles'};
   *
   * var distance = turf.distance(from, to, options);
   *
   * //addToMap
   * var addToMap = [from, to];
   * from.properties.distance = distance;
   * to.properties.distance = distance;
   */
  function distance(from, to, options) {
      // Optional parameters
      options = options || {};
      if (!isObject$1(options)) { throw new Error('options is invalid'); }
      var units = options.units;

      var coordinates1 = getCoord(from);
      var coordinates2 = getCoord(to);
      var dLat = degreesToRadians((coordinates2[1] - coordinates1[1]));
      var dLon = degreesToRadians((coordinates2[0] - coordinates1[0]));
      var lat1 = degreesToRadians(coordinates1[1]);
      var lat2 = degreesToRadians(coordinates2[1]);

      var a = Math.pow(Math.sin(dLat / 2), 2) +
            Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);

      return radiansToLength(2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)), units);
  }

  /**
   * Callback for coordEach
   *
   * @callback coordEachCallback
   * @param {Array<number>} currentCoord The current coordinate being processed.
   * @param {number} coordIndex The current index of the coordinate being processed.
   * @param {number} featureIndex The current index of the Feature being processed.
   * @param {number} multiFeatureIndex The current index of the Multi-Feature being processed.
   * @param {number} geometryIndex The current index of the Geometry being processed.
   */

  /**
   * Iterate over coordinates in any GeoJSON object, similar to Array.forEach()
   *
   * @name coordEach
   * @param {FeatureCollection|Feature|Geometry} geojson any GeoJSON object
   * @param {Function} callback a method that takes (currentCoord, coordIndex, featureIndex, multiFeatureIndex)
   * @param {boolean} [excludeWrapCoord=false] whether or not to include the final coordinate of LinearRings that wraps the ring in its iteration.
   * @returns {void}
   * @example
   * var features = turf.featureCollection([
   *   turf.point([26, 37], {"foo": "bar"}),
   *   turf.point([36, 53], {"hello": "world"})
   * ]);
   *
   * turf.coordEach(features, function (currentCoord, coordIndex, featureIndex, multiFeatureIndex, geometryIndex) {
   *   //=currentCoord
   *   //=coordIndex
   *   //=featureIndex
   *   //=multiFeatureIndex
   *   //=geometryIndex
   * });
   */
  function coordEach(geojson, callback, excludeWrapCoord) {
      // Handles null Geometry -- Skips this GeoJSON
      if (geojson === null) { return; }
      var j, k, l, geometry$$1, stopG, coords,
          geometryMaybeCollection,
          wrapShrink = 0,
          coordIndex = 0,
          isGeometryCollection,
          type = geojson.type,
          isFeatureCollection = type === 'FeatureCollection',
          isFeature = type === 'Feature',
          stop = isFeatureCollection ? geojson.features.length : 1;

      // This logic may look a little weird. The reason why it is that way
      // is because it's trying to be fast. GeoJSON supports multiple kinds
      // of objects at its root: FeatureCollection, Features, Geometries.
      // This function has the responsibility of handling all of them, and that
      // means that some of the `for` loops you see below actually just don't apply
      // to certain inputs. For instance, if you give this just a
      // Point geometry, then both loops are short-circuited and all we do
      // is gradually rename the input until it's called 'geometry'.
      //
      // This also aims to allocate as few resources as possible: just a
      // few numbers and booleans, rather than any temporary arrays as would
      // be required with the normalization approach.
      for (var featureIndex = 0; featureIndex < stop; featureIndex++) {
          geometryMaybeCollection = (isFeatureCollection ? geojson.features[featureIndex].geometry :
              (isFeature ? geojson.geometry : geojson));
          isGeometryCollection = (geometryMaybeCollection) ? geometryMaybeCollection.type === 'GeometryCollection' : false;
          stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;

          for (var geomIndex = 0; geomIndex < stopG; geomIndex++) {
              var multiFeatureIndex = 0;
              var geometryIndex = 0;
              geometry$$1 = isGeometryCollection ?
                  geometryMaybeCollection.geometries[geomIndex] : geometryMaybeCollection;

              // Handles null Geometry -- Skips this geometry
              if (geometry$$1 === null) { continue; }
              coords = geometry$$1.coordinates;
              var geomType = geometry$$1.type;

              wrapShrink = (excludeWrapCoord && (geomType === 'Polygon' || geomType === 'MultiPolygon')) ? 1 : 0;

              switch (geomType) {
              case null:
                  break;
              case 'Point':
                  if (callback(coords, coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) { return false; }
                  coordIndex++;
                  multiFeatureIndex++;
                  break;
              case 'LineString':
              case 'MultiPoint':
                  for (j = 0; j < coords.length; j++) {
                      if (callback(coords[j], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) { return false; }
                      coordIndex++;
                      if (geomType === 'MultiPoint') { multiFeatureIndex++; }
                  }
                  if (geomType === 'LineString') { multiFeatureIndex++; }
                  break;
              case 'Polygon':
              case 'MultiLineString':
                  for (j = 0; j < coords.length; j++) {
                      for (k = 0; k < coords[j].length - wrapShrink; k++) {
                          if (callback(coords[j][k], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) { return false; }
                          coordIndex++;
                      }
                      if (geomType === 'MultiLineString') { multiFeatureIndex++; }
                      if (geomType === 'Polygon') { geometryIndex++; }
                  }
                  if (geomType === 'Polygon') { multiFeatureIndex++; }
                  break;
              case 'MultiPolygon':
                  for (j = 0; j < coords.length; j++) {
                      if (geomType === 'MultiPolygon') { geometryIndex = 0; }
                      for (k = 0; k < coords[j].length; k++) {
                          for (l = 0; l < coords[j][k].length - wrapShrink; l++) {
                              if (callback(coords[j][k][l], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) { return false; }
                              coordIndex++;
                          }
                          geometryIndex++;
                      }
                      multiFeatureIndex++;
                  }
                  break;
              case 'GeometryCollection':
                  for (j = 0; j < geometry$$1.geometries.length; j++)
                      { if (coordEach(geometry$$1.geometries[j], callback, excludeWrapCoord) === false) { return false; } }
                  break;
              default:
                  throw new Error('Unknown Geometry Type');
              }
          }
      }
  }

  /**
   * Callback for featureEach
   *
   * @callback featureEachCallback
   * @param {Feature<any>} currentFeature The current Feature being processed.
   * @param {number} featureIndex The current index of the Feature being processed.
   */

  /**
   * Iterate over features in any GeoJSON object, similar to
   * Array.forEach.
   *
   * @name featureEach
   * @param {FeatureCollection|Feature|Geometry} geojson any GeoJSON object
   * @param {Function} callback a method that takes (currentFeature, featureIndex)
   * @returns {void}
   * @example
   * var features = turf.featureCollection([
   *   turf.point([26, 37], {foo: 'bar'}),
   *   turf.point([36, 53], {hello: 'world'})
   * ]);
   *
   * turf.featureEach(features, function (currentFeature, featureIndex) {
   *   //=currentFeature
   *   //=featureIndex
   * });
   */
  function featureEach(geojson, callback) {
      if (geojson.type === 'Feature') {
          callback(geojson, 0);
      } else if (geojson.type === 'FeatureCollection') {
          for (var i = 0; i < geojson.features.length; i++) {
              if (callback(geojson.features[i], i) === false) { break; }
          }
      }
  }

  /**
   * Callback for geomEach
   *
   * @callback geomEachCallback
   * @param {Geometry} currentGeometry The current Geometry being processed.
   * @param {number} featureIndex The current index of the Feature being processed.
   * @param {Object} featureProperties The current Feature Properties being processed.
   * @param {Array<number>} featureBBox The current Feature BBox being processed.
   * @param {number|string} featureId The current Feature Id being processed.
   */

  /**
   * Iterate over each geometry in any GeoJSON object, similar to Array.forEach()
   *
   * @name geomEach
   * @param {FeatureCollection|Feature|Geometry} geojson any GeoJSON object
   * @param {Function} callback a method that takes (currentGeometry, featureIndex, featureProperties, featureBBox, featureId)
   * @returns {void}
   * @example
   * var features = turf.featureCollection([
   *     turf.point([26, 37], {foo: 'bar'}),
   *     turf.point([36, 53], {hello: 'world'})
   * ]);
   *
   * turf.geomEach(features, function (currentGeometry, featureIndex, featureProperties, featureBBox, featureId) {
   *   //=currentGeometry
   *   //=featureIndex
   *   //=featureProperties
   *   //=featureBBox
   *   //=featureId
   * });
   */
  function geomEach(geojson, callback) {
      var i, j, g, geometry$$1, stopG,
          geometryMaybeCollection,
          isGeometryCollection,
          featureProperties,
          featureBBox,
          featureId,
          featureIndex = 0,
          isFeatureCollection = geojson.type === 'FeatureCollection',
          isFeature = geojson.type === 'Feature',
          stop = isFeatureCollection ? geojson.features.length : 1;

      // This logic may look a little weird. The reason why it is that way
      // is because it's trying to be fast. GeoJSON supports multiple kinds
      // of objects at its root: FeatureCollection, Features, Geometries.
      // This function has the responsibility of handling all of them, and that
      // means that some of the `for` loops you see below actually just don't apply
      // to certain inputs. For instance, if you give this just a
      // Point geometry, then both loops are short-circuited and all we do
      // is gradually rename the input until it's called 'geometry'.
      //
      // This also aims to allocate as few resources as possible: just a
      // few numbers and booleans, rather than any temporary arrays as would
      // be required with the normalization approach.
      for (i = 0; i < stop; i++) {

          geometryMaybeCollection = (isFeatureCollection ? geojson.features[i].geometry :
              (isFeature ? geojson.geometry : geojson));
          featureProperties = (isFeatureCollection ? geojson.features[i].properties :
              (isFeature ? geojson.properties : {}));
          featureBBox = (isFeatureCollection ? geojson.features[i].bbox :
              (isFeature ? geojson.bbox : undefined));
          featureId = (isFeatureCollection ? geojson.features[i].id :
              (isFeature ? geojson.id : undefined));
          isGeometryCollection = (geometryMaybeCollection) ? geometryMaybeCollection.type === 'GeometryCollection' : false;
          stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;

          for (g = 0; g < stopG; g++) {
              geometry$$1 = isGeometryCollection ?
                  geometryMaybeCollection.geometries[g] : geometryMaybeCollection;

              // Handle null Geometry
              if (geometry$$1 === null) {
                  if (callback(null, featureIndex, featureProperties, featureBBox, featureId) === false) { return false; }
                  continue;
              }
              switch (geometry$$1.type) {
              case 'Point':
              case 'LineString':
              case 'MultiPoint':
              case 'Polygon':
              case 'MultiLineString':
              case 'MultiPolygon': {
                  if (callback(geometry$$1, featureIndex, featureProperties, featureBBox, featureId) === false) { return false; }
                  break;
              }
              case 'GeometryCollection': {
                  for (j = 0; j < geometry$$1.geometries.length; j++) {
                      if (callback(geometry$$1.geometries[j], featureIndex, featureProperties, featureBBox, featureId) === false) { return false; }
                  }
                  break;
              }
              default:
                  throw new Error('Unknown Geometry Type');
              }
          }
          // Only increase `featureIndex` per each feature
          featureIndex++;
      }
  }

  /**
   * Callback for geomReduce
   *
   * The first time the callback function is called, the values provided as arguments depend
   * on whether the reduce method has an initialValue argument.
   *
   * If an initialValue is provided to the reduce method:
   *  - The previousValue argument is initialValue.
   *  - The currentValue argument is the value of the first element present in the array.
   *
   * If an initialValue is not provided:
   *  - The previousValue argument is the value of the first element present in the array.
   *  - The currentValue argument is the value of the second element present in the array.
   *
   * @callback geomReduceCallback
   * @param {*} previousValue The accumulated value previously returned in the last invocation
   * of the callback, or initialValue, if supplied.
   * @param {Geometry} currentGeometry The current Geometry being processed.
   * @param {number} featureIndex The current index of the Feature being processed.
   * @param {Object} featureProperties The current Feature Properties being processed.
   * @param {Array<number>} featureBBox The current Feature BBox being processed.
   * @param {number|string} featureId The current Feature Id being processed.
   */

  /**
   * Reduce geometry in any GeoJSON object, similar to Array.reduce().
   *
   * @name geomReduce
   * @param {FeatureCollection|Feature|Geometry} geojson any GeoJSON object
   * @param {Function} callback a method that takes (previousValue, currentGeometry, featureIndex, featureProperties, featureBBox, featureId)
   * @param {*} [initialValue] Value to use as the first argument to the first call of the callback.
   * @returns {*} The value that results from the reduction.
   * @example
   * var features = turf.featureCollection([
   *     turf.point([26, 37], {foo: 'bar'}),
   *     turf.point([36, 53], {hello: 'world'})
   * ]);
   *
   * turf.geomReduce(features, function (previousValue, currentGeometry, featureIndex, featureProperties, featureBBox, featureId) {
   *   //=previousValue
   *   //=currentGeometry
   *   //=featureIndex
   *   //=featureProperties
   *   //=featureBBox
   *   //=featureId
   *   return currentGeometry
   * });
   */
  function geomReduce(geojson, callback, initialValue) {
      var previousValue = initialValue;
      geomEach(geojson, function (currentGeometry, featureIndex, featureProperties, featureBBox, featureId) {
          if (featureIndex === 0 && initialValue === undefined) { previousValue = currentGeometry; }
          else { previousValue = callback(previousValue, currentGeometry, featureIndex, featureProperties, featureBBox, featureId); }
      });
      return previousValue;
  }

  /**
   * Takes one or more features and returns their area in square meters.
   *
   * @name area
   * @param {GeoJSON} geojson input GeoJSON feature(s)
   * @returns {number} area in square meters
   * @example
   * var polygon = turf.polygon([[[125, -15], [113, -22], [154, -27], [144, -15], [125, -15]]]);
   *
   * var area = turf.area(polygon);
   *
   * //addToMap
   * var addToMap = [polygon]
   * polygon.properties.area = area
   */
  function area(geojson) {
      return geomReduce(geojson, function (value, geom) {
          return value + calculateArea(geom);
      }, 0);
  }

  var RADIUS = 6378137;
  // var FLATTENING_DENOM = 298.257223563;
  // var FLATTENING = 1 / FLATTENING_DENOM;
  // var POLAR_RADIUS = RADIUS * (1 - FLATTENING);

  /**
   * Calculate Area
   *
   * @private
   * @param {GeoJSON} geojson GeoJSON
   * @returns {number} area
   */
  function calculateArea(geojson) {
      var area = 0, i;
      switch (geojson.type) {
      case 'Polygon':
          return polygonArea(geojson.coordinates);
      case 'MultiPolygon':
          for (i = 0; i < geojson.coordinates.length; i++) {
              area += polygonArea(geojson.coordinates[i]);
          }
          return area;
      case 'Point':
      case 'MultiPoint':
      case 'LineString':
      case 'MultiLineString':
          return 0;
      case 'GeometryCollection':
          for (i = 0; i < geojson.geometries.length; i++) {
              area += calculateArea(geojson.geometries[i]);
          }
          return area;
      }
  }

  function polygonArea(coords) {
      var area = 0;
      if (coords && coords.length > 0) {
          area += Math.abs(ringArea(coords[0]));
          for (var i = 1; i < coords.length; i++) {
              area -= Math.abs(ringArea(coords[i]));
          }
      }
      return area;
  }

  /**
   * @private
   * Calculate the approximate area of the polygon were it projected onto the earth.
   * Note that this area will be positive if ring is oriented clockwise, otherwise it will be negative.
   *
   * Reference:
   * Robert. G. Chamberlain and William H. Duquette, "Some Algorithms for Polygons on a Sphere", JPL Publication 07-03, Jet Propulsion
   * Laboratory, Pasadena, CA, June 2007 http://trs-new.jpl.nasa.gov/dspace/handle/2014/40409
   *
   * @param {Array<Array<number>>} coords Ring Coordinates
   * @returns {number} The approximate signed geodesic area of the polygon in square meters.
   */
  function ringArea(coords) {
      var p1;
      var p2;
      var p3;
      var lowerIndex;
      var middleIndex;
      var upperIndex;
      var i;
      var area = 0;
      var coordsLength = coords.length;

      if (coordsLength > 2) {
          for (i = 0; i < coordsLength; i++) {
              if (i === coordsLength - 2) { // i = N-2
                  lowerIndex = coordsLength - 2;
                  middleIndex = coordsLength - 1;
                  upperIndex = 0;
              } else if (i === coordsLength - 1) { // i = N-1
                  lowerIndex = coordsLength - 1;
                  middleIndex = 0;
                  upperIndex = 1;
              } else { // i = 0 to N-3
                  lowerIndex = i;
                  middleIndex = i + 1;
                  upperIndex = i + 2;
              }
              p1 = coords[lowerIndex];
              p2 = coords[middleIndex];
              p3 = coords[upperIndex];
              area += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
          }

          area = area * RADIUS * RADIUS / 2;
      }

      return area;
  }

  function rad(_) {
      return _ * Math.PI / 180;
  }

  var BaseClient = function BaseClient(opts) {
    this.config = opts.config;
    this.store = opts.store;
    this.dataManager = opts.dataManager;
  };

  BaseClient.prototype.evaluateParams = function evaluateParams (feature, dataSource) {
    // console.log('base-client evaluateParams is running')
    // console.log('evaluateParams feature: ', feature)
    var params = {};
    if (!dataSource.options.params) { return params }  var paramEntries = Object.entries(dataSource.options.params);
    var state = this.store.state;

    for (var i = 0, list = paramEntries; i < list.length; i += 1) {
      var ref = list[i];
        var key = ref[0];
        var valOrGetter = ref[1];

        var val = (void 0);

      if (typeof valOrGetter === 'function') {
        val = valOrGetter(feature, state);
      } else {
        val = valOrGetter;
      }

      params[key] = val;
    }

    return params;
  };

  BaseClient.prototype.assignFeatureIds = function assignFeatureIds (features, dataSourceKey, topicId) {
    var featuresWithIds = [];

    // REVIEW this was not working with Array.map for some reason
    // it was returning an object when fetchJson was used
    // that is now converted to an array in fetchJson
    for (var i = 0; i < features.length; i++) {
      var suffix = (topicId ? topicId + '-' : '') + i;
      var id = "feat-" + dataSourceKey + "-" + suffix;
      var feature = features[i];
      // console.log(dataSourceKey, feature);
      try {
        feature._featureId = id;
      }
      catch (e) {
        console.warn(e);
      }
      featuresWithIds.push(feature);
    }

    // console.log(dataSourceKey, features, featuresWithIds);
    return featuresWithIds;
  };

  BaseClient.prototype.didFetch = function didFetch (key, status, data, targetId) {
    // console.log('DID FETCH DATA:', key, targetId || '', data);

    var dataOrNull = status === 'error' ? null : data;
    var stateData = dataOrNull;

    // if this is an array, assign feature ids
    if (Array.isArray(stateData)) {
      stateData = this.assignFeatureIds(stateData, key, targetId);
    }

    // does this data source have targets?
    // const targets = this.config.dataSources[key].targets;

    // put data in state
    var setSourceDataOpts = {
      key: key,
      data: stateData,
    };
    var setSourceStatusOpts = {
      key: key,
      status: status
    };
    if (targetId) {
      setSourceDataOpts.targetId = targetId;
      setSourceStatusOpts.targetId = targetId;
    }

    // commit
    this.store.commit('setSourceData', setSourceDataOpts);
    this.store.commit('setSourceStatus', setSourceStatusOpts);

    // try fetching more data
    // console.log('171111 base-client js is calling fetchData()')
    this.fetchData();
  };

  // the high-level purpose of this is: take an address, geocode it, and put
  // the result in state.
  var GeocodeClient = /*@__PURE__*/(function (BaseClient$$1) {
    function GeocodeClient () {
      BaseClient$$1.apply(this, arguments);
    }

    if ( BaseClient$$1 ) GeocodeClient.__proto__ = BaseClient$$1;
    GeocodeClient.prototype = Object.create( BaseClient$$1 && BaseClient$$1.prototype );
    GeocodeClient.prototype.constructor = GeocodeClient;

    GeocodeClient.prototype.fetch = function fetch (input) {
      // console.log('geocode client fetch', input);

      var store = this.store;
      var geocodeConfig;

      geocodeConfig = this.config.geocoder;
      var url = geocodeConfig.url(input);
      var params = geocodeConfig.params;

      // update state
      this.store.commit('setGeocodeStatus', 'waiting');

      var success = this.success.bind(this);
      var error = this.error.bind(this);

      // return a promise that can accept further chaining
      return axios.get(url, { params: params })
        .then(success)
        .catch(error);
    };

    GeocodeClient.prototype.success = function success (response) {
      var store = this.store;
      var data = response.data;
      var url = response.config.url;
      // console.log('geocode search success', response.config.url);

      // TODO handle multiple results

      if (!data.features || data.features.length < 1) {
        return;
      }

      var features = data.features;
      features = this.assignFeatureIds(features, 'geocode');

      // TODO do some checking here
      var feature = features[0];
      var relatedFeatures = [];
      for (var i = 0, list = features.slice(1); i < list.length; i += 1){
        var relatedFeature = list[i];

        if (!!feature.properties.address_high) {
          if (relatedFeature.properties.address_high) {
            relatedFeatures.push(relatedFeature);
          }
        } else {
          relatedFeatures.push(relatedFeature);
        }
      }
      store.commit('setGeocodeData', feature);
      store.commit('setGeocodeRelated', relatedFeatures);
      store.commit('setGeocodeStatus', 'success');
      return feature;
    };

    GeocodeClient.prototype.error = function error (error$1) {
      var store = this.store;
      store.commit('setGeocodeStatus', 'error');
      store.commit('setGeocodeData', null);
      store.commit('setGeocodeRelated', null);
    };

    return GeocodeClient;
  }(BaseClient));

  var ActiveSearchClient = /*@__PURE__*/(function (BaseClient$$1) {
    function ActiveSearchClient () {
      BaseClient$$1.apply(this, arguments);
    }

    if ( BaseClient$$1 ) ActiveSearchClient.__proto__ = BaseClient$$1;
    ActiveSearchClient.prototype = Object.create( BaseClient$$1 && BaseClient$$1.prototype );
    ActiveSearchClient.prototype.constructor = ActiveSearchClient;

    ActiveSearchClient.prototype.evaluateParams = function evaluateParams (feature, dataSource) {
      var params = {};
      if (!dataSource.options.params) { return params }    // console.log("dataSource: ", dataSource);
      var paramEntries = Object.entries(dataSource.options.params);
      var state = this.store.state;

      for (var i = 0, list = paramEntries; i < list.length; i += 1) {
        var ref = list[i];
        var key = ref[0];
        var valOrGetter = ref[1];

        var val = (void 0);

        if (typeof valOrGetter === 'function') {
          val = valOrGetter(feature);
        } else {
          val = valOrGetter;
        }
        params[key] = val;
      }
      // console.log("params: ", params)
      return params;
    };

    ActiveSearchClient.prototype.fetch = function fetch (input) {
      var this$1 = this;

      // console.log("fetch() input: ", input)

      var activeSearches = this.config.activeSearch || {};
      var activeSearchKeys = Object.entries(activeSearches);

      var loop = function () {
        var ref = list[i];
        var activeSearchKey = ref[0];
        var activeSearch = ref[1];

        var state = this$1.store.state;
        var data = [];

        if(input.properties) {
          data = input.properties.opa_account_num;
        } else if (input.parcel_number) {
          data = input.parcel_number;
        } else {
            data = input.map(function (a) { return a.parcel_number; });
        }

        var store = this$1.store;
        var url = activeSearch.url;

        var params = this$1.evaluateParams(data, activeSearch);

        var successFn = activeSearch.options.success;

        // if the data is not dependent on other data
        axios.get(url, { params: params }).then(function (response) {
          // call success fn

          var store = this$1.store;
          var data = response.data;
          var url = response.config.url;
          var status = 'success';

          if (successFn) {
            data = successFn(data);
          }

          var setSourceDataOpts = {
            activeSearchKey: activeSearchKey,
            data: data,
            status: status,
          };

          store.commit('setActiveSearchData', setSourceDataOpts);
          store.commit('setActiveSearchStatus',setSourceDataOpts);

        }, function (response) {
          // console.log('fetch json error', response);
          var status = 'error';
          var setSourceDataOpts = {
            activeSearchKey: activeSearchKey,
            data: data,
            status: status,
          };
          store.commit('setActiveSearchData', setSourceDataOpts);
        });
      };

      for (var i = 0, list = activeSearchKeys; i < list.length; i += 1) loop();
    };

    return ActiveSearchClient;
  }(BaseClient));

  // the high-level purpose of this is: take an address, geocode it, and put
  // the result in state.
  var CondoSearchClient = /*@__PURE__*/(function (BaseClient$$1) {
    function CondoSearchClient () {
      BaseClient$$1.apply(this, arguments);
    }

    if ( BaseClient$$1 ) CondoSearchClient.__proto__ = BaseClient$$1;
    CondoSearchClient.prototype = Object.create( BaseClient$$1 && BaseClient$$1.prototype );
    CondoSearchClient.prototype.constructor = CondoSearchClient;

    CondoSearchClient.prototype.fetch = function fetch (input) {
      // console.log('geocode client fetch', input);

      var store = this.store;
      var condoConfig = JSON.parse(JSON.stringify(this.config.geocoder));
      condoConfig.url = this.config.geocoder.url;
      console.log(condoConfig);

      condoConfig.params.opa_only = false;

      var url = condoConfig.url(input);
      var params = condoConfig.params;
      console.log(params);

      // update state
      this.store.commit('setGeocodeStatus', 'waiting');

      var success = this.success.bind(this);
      var error = this.error.bind(this);

      // return a promise that can accept further chaining
      return axios.get(url, { params: params })
        .then(success)
        .catch(error);
    };

    CondoSearchClient.prototype.success = function success (response) {
      var store = this.store;
      var data = response.data;
      var url = response.config.url;
      console.log('geocode search success', data);

      // TODO handle multiple results

      if (!data.features || data.features.length < 1) {
        return;
      }

      var features = data.features;

      features = this.assignFeatureIds(features, 'geocode');

      // TODO do some checking here
      var feature = features[0];
      var relatedFeatures = [];
      for (var i = 0, list = features.slice(1); i < list.length; i += 1){
        var relatedFeature = list[i];

        if (!!feature.properties.address_high) {
          if (relatedFeature.properties.address_high) {
            relatedFeatures.push(relatedFeature);
          }
        } else {
          relatedFeatures.push(relatedFeature);
        }
      }
      store.commit('setGeocodeData', feature);
      store.commit('setGeocodeRelated', relatedFeatures);
      store.commit('setGeocodeStatus', 'success');
      this.store.commit('setLastSearchMethod', 'geocode');

      return feature;
    };

    CondoSearchClient.prototype.error = function error (error$1) {
      var store = this.store;

      store.commit('setGeocodeStatus', 'error');
      store.commit('setGeocodeData', null);
      store.commit('setGeocodeRelated', null);
    };

    return CondoSearchClient;
  }(BaseClient));

  // the high-level purpose of this is: take a person, search AIS for them, and put
  // the result in state.
  var OwnerSearchClient = /*@__PURE__*/(function (BaseClient$$1) {
    function OwnerSearchClient () {
      BaseClient$$1.apply(this, arguments);
    }

    if ( BaseClient$$1 ) OwnerSearchClient.__proto__ = BaseClient$$1;
    OwnerSearchClient.prototype = Object.create( BaseClient$$1 && BaseClient$$1.prototype );
    OwnerSearchClient.prototype.constructor = OwnerSearchClient;

    OwnerSearchClient.prototype.fetch = function fetch (input) {
      // console.log('owner search client fetch', input);

      var store = this.store;

      var ownerSearchConfig = this.config.ownerSearch;
      // console.log('owner search-client, ownerSearchConfig:', ownerSearchConfig);
      var url = ownerSearchConfig.url(input);
      var params = ownerSearchConfig.params;
      // console.log('owner search client url', url);
      // update state
      this.store.commit('setOwnerSearchStatus', 'waiting');
      // this.store.commit('setLastSearchMethod', 'owner search');

      var success = this.success.bind(this);
      var error = this.error.bind(this);

      // return a promise that can accept further chaining
      return axios.get(url, { params: params })
        .then(success, error);
    };

    OwnerSearchClient.prototype.success = function success (response) {
      // console.log('owner search success', response.data);

      var store = this.store;
      var data = response.data;
      var url = response.config.url;
      // console.log(url)

      // TODO handle multiple results

      if (!data.features || data.features.length < 1) {
        // console.log('owner search got no features', data);

        return;
      }

      var features = data.features;
      features = this.assignFeatureIds(features, 'owner');

      // TODO do some checking here
      // const feature = data.features[0];
      // let relatedFeatures = [];
      // for (let relatedFeature of data.features.slice(1)){
      //   if (!!feature.properties.address_high) {
      //     if (relatedFeature.properties.address_high) {
      //       relatedFeatures.push(relatedFeature);
      //     }
      //   } else {
      //     relatedFeatures.push(relatedFeature);
      //   }
      // }
      store.commit('setShapeSearchStatus', null);
      store.commit('setShapeSearchData', null);
      store.commit('setOwnerSearchData', features);

      // store.commit('setOwnerSearchData', data.features);
      // store.commit('setOwnerSearchRelated', relatedFeatures);
      store.commit('setOwnerSearchStatus', 'success');

      return features;
    };

    OwnerSearchClient.prototype.error = function error (error$1) {
      // console.log('owner search error', error);
      var store = this.store;
      store.commit('setOwnerSearchStatus', 'error');
      store.commit('setOwnerSearchData', null);
      // store.commit('setOwnerSearchRelated', null);
      throw error$1
    };

    return OwnerSearchClient;
  }(BaseClient));

  require('lodash');


  var ShapeSearchClient = /*@__PURE__*/(function (BaseClient$$1) {
    function ShapeSearchClient () {
      BaseClient$$1.apply(this, arguments);
    }

    if ( BaseClient$$1 ) ShapeSearchClient.__proto__ = BaseClient$$1;
    ShapeSearchClient.prototype = Object.create( BaseClient$$1 && BaseClient$$1.prototype );
    ShapeSearchClient.prototype.constructor = ShapeSearchClient;

    ShapeSearchClient.prototype.evaluateParams = function evaluateParams (feature, dataSource) {
      // console.log('http-client evaluateParams is running');
      var params = {};
      if (!dataSource.options.params) { return params }    var paramEntries = Object.entries(dataSource.options.params);
      var state = this.store.state;

      for (var i = 0, list = paramEntries; i < list.length; i += 1) {
        var ref = list[i];
        var key = ref[0];
        var valOrGetter = ref[1];

        var val = (void 0);

        if (typeof valOrGetter === 'function') {
          // console.log(feature);
          val = valOrGetter(feature);
        } else {
          val = valOrGetter;
        }
        params[key] = val;
      }
      return params;
    };

    ShapeSearchClient.prototype.evaluateDataForUnits = function evaluateDataForUnits (data) {
      // console.log("evaluateDataForUnits data: ", data);
      // console.log("evaluateDataForUnits dataRows: ",dataRows);
      var groupedData = _.groupBy(data.rows, function (a) { return a.pwd_parcel_id; });
      // console.log("evaluateDataForUnits groupedData: ", groupedData);

      var units = [], dataList = [];

      for (var item in groupedData){
        groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
        dataList.push(groupedData[item][0]);
      }

      var mObj = JSON.parse(JSON.stringify(data.rows[0]));

      if(units.length > 0) {
        units = _.groupBy(units, function (a) { return a.pwd_parcel_id; });
        data.rows = data.rows.filter(function (a) { return !Object.keys(units).includes(a.pwd_parcel_id); });
      }

      // console.log("Units List: ", units, "Data: ", data )
      this.store.commit('setShapeSearchUnits', units);

      for (var unit in units) {
        // console.log("Unit: ", units[unit])
        for (var i in mObj) { mObj[i] = "";  }
        var mObjPush = JSON.parse(JSON.stringify(mObj));
        mObjPush.location = units[unit][0].location;
        mObjPush.pwd_parcel_id = units[unit][0].pwd_parcel_id;
        data.rows.push(mObjPush);
      }
      return data
    };

    ShapeSearchClient.prototype.fetch = function fetch (input) {
      // console.log('shapeSearch client fetch', input);
      var data =  input.map(function (a) { return a.properties.PARCELID.toString(); });
      // console.log('shapeSearch DATA', data);

      var store = this.store;
      var shapeSearchConfig = this.config.shapeSearch;
      var url = shapeSearchConfig.url;

      var params = this.evaluateParams(data, shapeSearchConfig);

      var success = this.success.bind(this);
      var error = this.error.bind(this);

      return axios.get(url, { params: params })
                                      .then(success)
                                      .catch(error);
    };

    ShapeSearchClient.prototype.success = function success (response) {
      // console.log("success respose: ", response);

      var store = this.store;
      var data = response.data;
      var url = response.config.url;

      // this.evaluateDataForCondos(data);
      data = this.evaluateDataForUnits(data);

      var features = data.rows;
      // console.log(features)
      features = this.assignFeatureIds(features, 'shape');
      // console.log(features)


      // store.commit('setShapeSearchUnits', units);
      store.commit('setShapeSearchData', data);
      store.commit('setShapeSearchStatus', 'success');
      store.commit('setDrawShape', null);

      return features;
    };

    ShapeSearchClient.prototype.error = function error (error$1) {
      // console.log("error respose: ", error);
      return
    };

    return ShapeSearchClient;
  }(BaseClient));

  var HttpClient = /*@__PURE__*/(function (BaseClient$$1) {
    function HttpClient () {
      BaseClient$$1.apply(this, arguments);
    }

    if ( BaseClient$$1 ) HttpClient.__proto__ = BaseClient$$1;
    HttpClient.prototype = Object.create( BaseClient$$1 && BaseClient$$1.prototype );
    HttpClient.prototype.constructor = HttpClient;

    HttpClient.prototype.fetch = function fetch (feature, dataSource, dataSourceKey, targetIdFn) {
      var this$1 = this;

      var params = this.evaluateParams(feature, dataSource);
      // console.log('http-client fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);
      var url = dataSource.url;
      var options = dataSource.options;
      var urlAddition = params.urlAddition;
      if (urlAddition) {
        url += encodeURIComponent(urlAddition);
        // url += encodeURIComponent(urlAddition.properties.street_address);
      }
      // console.log('url', url);
      // console.log('http-client fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);
      var successFn = options.success;

      if (params.urlAddition) {
        delete params['urlAddition'];
      }

      // if the data is not dependent on other data
      axios.get(url, { params: params }).then(function (response) {
        // call success fn
        var data = response.data;

        if (successFn) {
          data = successFn(data);
        }

        // get target id, if there should be one
        var targetId;
        if (targetIdFn) {
          targetId = targetIdFn(feature);
          // console.log('in http-client, targetIdFn:', targetIdFn, 'feature:', feature, 'targetId:', targetId);
        }

        this$1.dataManager.didFetchData(dataSourceKey, 'success', data, targetId, targetIdFn);
      }, function (response) {
        // console.log('fetch json error', response);
        this$1.dataManager.didFetchData(dataSourceKey, 'error');
      });
    };

    HttpClient.prototype.fetchMore = function fetchMore (feature, dataSource, dataSourceKey, highestPageRetrieved) {
      var this$1 = this;

      var params = this.evaluateParams(feature, dataSource);
      params.page = highestPageRetrieved + 1;
      var url = dataSource.url;
      var options = dataSource.options;
      var urlAddition = params.urlAddition;
      if (urlAddition) {
        // url += encodeURIComponent(urlAddition.properties.street_address);
        url += encodeURIComponent(urlAddition);
      }
      var successFn = options.success;

      // if the data is not dependent on other data
      axios.get(url, { params: params }).then(function (response) {
        // call success fn
        var data = response.data;
        if (successFn) {
          data = successFn(data);
        }
        // console.log('data', data);
        this$1.dataManager.didFetchMoreData(dataSourceKey, 'success', data);
      }, function (response) {
        // console.log('fetch json error', response);
        this$1.dataManager.didFetchMoreData(dataSourceKey, 'error');
      });
    };

    HttpClient.prototype.fetchNearby = function fetchNearby (feature, dataSource, dataSourceKey, targetIdFn) {
      var this$1 = this;

      var params = this.evaluateParams(feature, dataSource);
      var url = dataSource.url;
      var options = dataSource.options;
      // const srid = options.srid || 4326;
      var table = options.table;
      // TODO generalize these options into something like a `sql` param that
      // returns a sql statement
      var dateMinNum = options.dateMinNum || null;
      var dateMinType = options.dateMinType || null;
      var dateField = options.dateField || null;
      var successFn = options.success;
      var distances = options.distances || 250;
      // console.log('fetchNearby distances:', distances);

      var distQuery = "ST_Distance(the_geom::geography, ST_SetSRID(ST_Point("
                      + feature.geometry.coordinates[0]
                      + "," + feature.geometry.coordinates[1]
                      + "),4326)::geography)";

      var latQuery = "ST_Y(the_geom)";
      var lngQuery = "ST_X(the_geom)";

      // let select = '*'
      // if (calculateDistance) {
      var select = "*, " + distQuery + 'as distance,' + latQuery + 'as lat, ' + lngQuery + 'as lng';
      // }

      params['q'] = "select" + select + " from " + table + " where " + distQuery + " < " + distances;

      if (dateMinNum) {
        params['q'] = params['q'] + " and " + dateField + " > '" + moment().subtract(dateMinNum, dateMinType).format('YYYY-MM-DD') + "'";
      }

      // if the data is not dependent on other data
      axios.get(url, { params: params }).then(function (response) {
        // call success fn
        var data = response.data.rows;
        // console.log('table and data', table, data);

        if (successFn) {
          data = successFn(data);
        }

        // get target id, if there should be one
        var targetId;
        if (targetIdFn) {
          targetId = targetIdFn(feature);
        }

        this$1.dataManager.didFetchData(dataSourceKey, 'success', data, targetId);
      }, function (response) {
        // console.log('fetch json error', response);
        this$1.dataManager.didFetchData(dataSourceKey, 'error');
      });
    };

    return HttpClient;
  }(BaseClient));

  /**
   * Takes a feature or set of features and returns all positions as {@link Point|points}.
   *
   * @name explode
   * @param {GeoJSON} geojson input features
   * @returns {FeatureCollection<point>} points representing the exploded input features
   * @throws {Error} if it encounters an unknown geometry type
   * @example
   * var polygon = turf.polygon([[[-81, 41], [-88, 36], [-84, 31], [-80, 33], [-77, 39], [-81, 41]]]);
   *
   * var explode = turf.explode(polygon);
   *
   * //addToMap
   * var addToMap = [polygon, explode]
   */
  function explode(geojson) {
      var points$$1 = [];
      if (geojson.type === 'FeatureCollection') {
          featureEach(geojson, function (feature$$1) {
              coordEach(feature$$1, function (coord) {
                  points$$1.push(point(coord, feature$$1.properties));
              });
          });
      } else {
          coordEach(geojson, function (coord) {
              points$$1.push(point(coord, geojson.properties));
          });
      }
      return featureCollection(points$$1);
  }

  /**
   * Returns a cloned copy of the passed GeoJSON Object, including possible 'Foreign Members'.
   * ~3-5x faster than the common JSON.parse + JSON.stringify combo method.
   *
   * @name clone
   * @param {GeoJSON} geojson GeoJSON Object
   * @returns {GeoJSON} cloned GeoJSON Object
   * @example
   * var line = turf.lineString([[-74, 40], [-78, 42], [-82, 35]], {color: 'red'});
   *
   * var lineCloned = turf.clone(line);
   */
  function clone(geojson) {
      if (!geojson) { throw new Error('geojson is required'); }

      switch (geojson.type) {
      case 'Feature':
          return cloneFeature(geojson);
      case 'FeatureCollection':
          return cloneFeatureCollection(geojson);
      case 'Point':
      case 'LineString':
      case 'Polygon':
      case 'MultiPoint':
      case 'MultiLineString':
      case 'MultiPolygon':
      case 'GeometryCollection':
          return cloneGeometry(geojson);
      default:
          throw new Error('unknown GeoJSON type');
      }
  }

  /**
   * Clone Feature
   *
   * @private
   * @param {Feature<any>} geojson GeoJSON Feature
   * @returns {Feature<any>} cloned Feature
   */
  function cloneFeature(geojson) {
      var cloned = {type: 'Feature'};
      // Preserve Foreign Members
      Object.keys(geojson).forEach(function (key) {
          switch (key) {
          case 'type':
          case 'properties':
          case 'geometry':
              return;
          default:
              cloned[key] = geojson[key];
          }
      });
      // Add properties & geometry last
      cloned.properties = cloneProperties(geojson.properties);
      cloned.geometry = cloneGeometry(geojson.geometry);
      return cloned;
  }

  /**
   * Clone Properties
   *
   * @private
   * @param {Object} properties GeoJSON Properties
   * @returns {Object} cloned Properties
   */
  function cloneProperties(properties) {
      var cloned = {};
      if (!properties) { return cloned; }
      Object.keys(properties).forEach(function (key) {
          var value = properties[key];
          if (typeof value === 'object') {
              if (value === null) {
                  // handle null
                  cloned[key] = null;
              } else if (value.length) {
                  // handle Array
                  cloned[key] = value.map(function (item) {
                      return item;
                  });
              } else {
                  // handle generic Object
                  cloned[key] = cloneProperties(value);
              }
          } else { cloned[key] = value; }
      });
      return cloned;
  }

  /**
   * Clone Feature Collection
   *
   * @private
   * @param {FeatureCollection<any>} geojson GeoJSON Feature Collection
   * @returns {FeatureCollection<any>} cloned Feature Collection
   */
  function cloneFeatureCollection(geojson) {
      var cloned = {type: 'FeatureCollection'};

      // Preserve Foreign Members
      Object.keys(geojson).forEach(function (key) {
          switch (key) {
          case 'type':
          case 'features':
              return;
          default:
              cloned[key] = geojson[key];
          }
      });
      // Add features
      cloned.features = geojson.features.map(function (feature) {
          return cloneFeature(feature);
      });
      return cloned;
  }

  /**
   * Clone Geometry
   *
   * @private
   * @param {Geometry<any>} geometry GeoJSON Geometry
   * @returns {Geometry<any>} cloned Geometry
   */
  function cloneGeometry(geometry) {
      var geom = {type: geometry.type};
      if (geometry.bbox) { geom.bbox = geometry.bbox; }

      if (geometry.type === 'GeometryCollection') {
          geom.geometries = geometry.geometries.map(function (geom) {
              return cloneGeometry(geom);
          });
          return geom;
      }
      geom.coordinates = deepSlice(geometry.coordinates);
      return geom;
  }

  /**
   * Deep Slice coordinates
   *
   * @private
   * @param {Coordinates} coords Coordinates
   * @returns {Coordinates} all coordinates sliced
   */
  function deepSlice(coords) {
      if (typeof coords[0] !== 'object') { return coords.slice(); }
      return coords.map(function (coord) {
          return deepSlice(coord);
      });
  }

  /**
   * Takes a reference {@link Point|point} and a FeatureCollection of Features
   * with Point geometries and returns the
   * point from the FeatureCollection closest to the reference. This calculation
   * is geodesic.
   *
   * @name nearestPoint
   * @param {Coord} targetPoint the reference point
   * @param {FeatureCollection<Point>} points against input point set
   * @returns {Feature<Point>} the closest point in the set to the reference point
   * @example
   * var targetPoint = turf.point([28.965797, 41.010086], {"marker-color": "#0F0"});
   * var points = turf.featureCollection([
   *     turf.point([28.973865, 41.011122]),
   *     turf.point([28.948459, 41.024204]),
   *     turf.point([28.938674, 41.013324])
   * ]);
   *
   * var nearest = turf.nearestPoint(targetPoint, points);
   *
   * //addToMap
   * var addToMap = [targetPoint, points, nearest];
   * nearest.properties['marker-color'] = '#F00';
   */
  function nearestPoint(targetPoint, points) {
      // Input validation
      if (!targetPoint) { throw new Error('targetPoint is required'); }
      if (!points) { throw new Error('points is required'); }

      var nearest;
      var minDist = Infinity;
      featureEach(points, function (pt, featureIndex) {
          var distanceToPoint = distance(targetPoint, pt);
          if (distanceToPoint < minDist) {
              nearest = clone(pt);
              nearest.properties.featureIndex = featureIndex;
              nearest.properties.distanceToPoint = distanceToPoint;
              minDist = distanceToPoint;
          }

      });
      return nearest;
  }

  function objectWithoutProperties (obj, exclude) { var target = {}; for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && exclude.indexOf(k) === -1) target[k] = obj[k]; return target; }

  var EsriClient = /*@__PURE__*/(function (BaseClient$$1) {
    function EsriClient () {
      BaseClient$$1.apply(this, arguments);
    }

    if ( BaseClient$$1 ) EsriClient.__proto__ = BaseClient$$1;
    EsriClient.prototype = Object.create( BaseClient$$1 && BaseClient$$1.prototype );
    EsriClient.prototype.constructor = EsriClient;

    EsriClient.prototype.fetch = function fetch (feature$$1, dataSource, dataSourceKey) {
      // console.log('esriclient fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey);

      var url = dataSource.url;
      var ref = dataSource.options;
      var relationship = ref.relationship;
      var targetGeometry = ref.targetGeometry;
      var rest = objectWithoutProperties( ref, ["relationship", "targetGeometry"] );
      var options = rest;
      var parameters = dataSource.parameters;
      if (parameters) {
        parameters['sourceValue'] = feature$$1.properties[parameters.sourceField];
      }

      // check if a target geometry fn was specified. otherwise, use geocode feat
      var geom;
      if (targetGeometry) {
        var state = this.store.state;
        // pass leaflet to the targetgeom function so it can construct a custom
        // geometry (such as the lat lng bounds of a set of parcels) if it needs
        // to. use case: fetching regmaps.
        geom = targetGeometry(state, L);
      } else {
        geom = feature$$1.geometry;
      }

      // handle null geom
      if (!geom) {
        this.dataManager.didFetchData(dataSourceKey, 'error');
        return;
      }

      this.fetchBySpatialQuery(dataSourceKey, url, relationship, geom, parameters, options);
    };

    EsriClient.prototype.fetchNearby = function fetchNearby (feature$$1, dataSource, dataSourceKey) {
      var this$1 = this;

      // console.log('esri fetchNearby running, dataSource:', dataSource, 'dataSourceKey:', dataSourceKey);
      var projection4326 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
      var projection2272 = "+proj=lcc +lat_1=40.96666666666667 +lat_2=39.93333333333333 +lat_0=39.33333333333334 +lon_0=-77.75 +x_0=600000 +y_0=0 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs";

      var dataSourceUrl = dataSource.url;
      var ref = dataSource.options;
      var calculateDistance = ref.calculateDistance;
      var geometryServerUrl = ref.geometryServerUrl;
      var distances = ref.distances;
      var rest = objectWithoutProperties( ref, ["calculateDistance", "geometryServerUrl", "distances"] );
      var options = rest;

      // console.log('distances:', distances)

      // params.geometries = `[${feature.geometry.coordinates.join(', ')}]`
      // TODO get some of these values from map, etc.
      var coords = feature$$1.geometry.coordinates;
      var coords2272 = proj4(projection4326, projection2272, [coords[0], coords[1]]);
      // console.log('coords:', coords, 'coords2272:', coords2272);
      var params = {
        // geometries: feature => '[' + feature.geometry.coordinates[0] + ', ' + feature.geometry.coordinates[1] + ']',
        geometries: ("[" + (coords2272.join(', ')) + "]"),
        inSR: 2272,
        outSR: 4326,
        bufferSR: 2272,
        distances: distances, //|| 0.0028,
        // inSR: 4326,
        // outSR: 4326,
        // bufferSR: 4326,
        // distances: distances, //|| 0.0028,
        unionResults: true,
        geodesic: false,
        f: 'json',
      };
      // console.log('esri nearby params', params);

      // get buffer polygon
      var bufferUrl = geometryServerUrl.replace(/\/$/, '') + '/buffer';
      // console.log('bufferUrl:', bufferUrl);

      axios.get(bufferUrl, { params: params }).then(function (response) {
        var data = response.data;
        // console.log('axios in esri fetchNearby is running, data:', data);

        // console.log('did get esri nearby buffer', data);

        var geoms = data.geometries || [];
        var geom = geoms[0] || {};
        var rings = geom.rings || [];
        var xyCoords = rings[0];

        // check for xy coords
        if (!xyCoords) {
          // we can't do anything without coords, so bail out
          this$1.dataManager.didFetchData(dataSourceKey, 'error');
          return;
        }

        var latLngCoords = xyCoords.map(function (xyCoord) { return [].concat( xyCoord ).reverse(); });

        // get nearby features using buffer
        var buffer = L.polygon(latLngCoords);
        var map = this$1.dataManager.store.state.map.map;

        // DEBUG
        // buffer.addTo(map);

        //this is a space holder
        var parameters = {};
        // console.log('about to call fetchBySpatialQuery');
        this$1.fetchBySpatialQuery(dataSourceKey,
                                 dataSourceUrl,
                                 'within',
                                 buffer,
                                 parameters,
                                 options,
                                 calculateDistance ? coords : null
                                );
      }, function (response) {
        // console.log('did fetch esri nearby error', response);

        this$1.dataManager.didFetchData(dataSourceKey, 'error');
      });
    };

    EsriClient.prototype.fetchBySpatialQuery = function fetchBySpatialQuery (dataSourceKey, url, relationship, targetGeom, parameters, options, calculateDistancePt) {
      var this$1 = this;
      if ( parameters === void 0 ) parameters = {};
      if ( options === void 0 ) options = {};

      // console.log('fetch esri spatial query, dataSourceKey:', dataSourceKey, 'url:', url, 'relationship:', relationship, 'targetGeom:', targetGeom, 'parameters:', parameters, 'options:', options, 'calculateDistancePt:', calculateDistancePt);

      var query;
      if (relationship === 'where') {
        query = esriLeaflet.query({ url: url })[relationship](parameters.targetField + "='" + parameters.sourceValue + "'");
      } else {
        query = esriLeaflet.query({ url: url })[relationship](targetGeom);
      }

      // apply options by chaining esri leaflet option methods
      var optionsKeys = Object.keys(options) || [];
      query = optionsKeys.reduce(function (acc, optionsKey) {
        var optionsVal = options[optionsKey];

        try {
          acc = acc[optionsKey](optionsVal);
        } catch (e) {
          throw new Error(("esri-leaflet query task does not support option:\n                         " + optionsKey));
        }

        return acc;
      }, query);

      query.run(function (error, featureCollection$$1, response) {
        // console.log('did get esri spatial query', response, error);

        var features = (featureCollection$$1 || {}).features;
        var status = error ? 'error' : 'success';

        // calculate distance
        if (calculateDistancePt) {
          var from = point(calculateDistancePt);

          features = features.map(function (feature$$1) {
            var featureCoords = feature$$1.geometry.coordinates;
            // console.log('featureCoords:', featureCoords);
            var dist;
            if (Array.isArray(featureCoords[0])) {
              var polygonInstance = polygon([featureCoords[0]]);
              var vertices = explode(polygonInstance);
              var closestVertex = nearestPoint(from, vertices);
              dist = distance(from, closestVertex, { units: 'miles' });
            } else {
              var to = point(featureCoords);
              dist = distance(from, to, { units: 'miles' });
            }

            // TODO make distance units an option. for now, just hard code to ft.
            var distFeet = parseInt(dist * 5280);
            // console.log('distFeet:', distFeet);

            feature$$1._distance = distFeet;

            return feature$$1;
          });
        }

        this$1.dataManager.didFetchData(dataSourceKey, status, features);
      });
    };

    return EsriClient;
  }(BaseClient));

  /*
  The DataManager is responsible for fetching external data (mainly API responses)
  and storing them in state.

  The router should own an instance of DataManager and make calls to it based on
  navigation events.
  */

  var DataManager = function DataManager(opts) {
    var store = this.store = opts.store;
    var config = this.config = opts.config;
    // this.eventBus = opts.eventBus;
    this.controller = opts.controller;

    // create clients
    this.clients = {};

    // REVIEW do these need the store any more? or can they just pass the
    // response back to this?
    var clientOpts = { config: config, store: store, dataManager: this };
    this.clients.geocode = new GeocodeClient(clientOpts);
    this.clients.condoSearch = new CondoSearchClient(clientOpts);
    this.clients.ownerSearch = new OwnerSearchClient(clientOpts);
    this.clients.shapeSearch = new ShapeSearchClient(clientOpts);
    this.clients.activeSearch = new ActiveSearchClient(clientOpts);
    this.clients.http = new HttpClient(clientOpts);
    this.clients.esri = new EsriClient(clientOpts);
  };

  /* STATE HELPERS */


  /* DATA FETCHING METHODS */

  DataManager.prototype.fetchRowData = function fetchRowData (){
    // console.log("Fetching row data")

    var state = this.store.state;
    var input = [];
    if (state.lastSearchMethod === 'owner search') {
        input = state.ownerSearch.data.filter(function (object) {
                     return object._featureId === state.activeFeature.featureId
                    });
      } else if (state.lastSearchMethod === 'shape search') {
        input = state.shapeSearch.data.rows.filter(function (object) {
                     return object._featureId === state.activeFeature.featureId
                     });
      } else {
        input.push(state.geocode.data);
        for (var i = 0, list = state.geocode.related; i < list.length; i += 1) {
          var relate = list[i];

            input.push(relate);
        }
      }
    this.clients.activeSearch.fetch(input[0]);
  };

  DataManager.prototype.fetchMoreData = function fetchMoreData (dataSourceKey, highestPageRetrieved) {
    var feature$$1 = this.store.state.geocode.data;
    var dataSource = this.config.dataSources[dataSourceKey];
    var state = this.store.state;
    var type = dataSource.type;

    // update secondary status to `waiting`
    var setSecondarySourceStatusOpts = {
      key: dataSourceKey,
      secondaryStatus: 'waiting'
    };
    this.store.commit('setSecondarySourceStatus', setSecondarySourceStatusOpts);
    console.log('INCREMENT - datamanager get 100 More was clicked, type', type, 'dataSource', dataSource, 'highestPageRetrieved', highestPageRetrieved);

    switch(type) {
      case 'http-get':
        console.log('INCREMENT - http-get', dataSourceKey);
        this.clients.http.fetchMore(feature$$1,
                                dataSource,
                                dataSourceKey,
                                highestPageRetrieved);
        break;
    }
  };

  DataManager.prototype.didFetchMoreData = function didFetchMoreData (key, secondaryStatus, data) {
    console.log('INCREMENT - DID FETCH More DATA:', key, secondaryStatus, data);

    var dataOrNull = status === 'error' ? null : data;
    var stateData = dataOrNull;

    // if this is an array, assign feature ids
    if (Array.isArray(stateData)) {
      stateData = this.assignFeatureIds(stateData, key);
    }

    var nextPage = this.store.state.sources[key].data.page + 1;

    // put data in state
    var setSourceDataOpts = {
      key: key,
      data: stateData,
      page: nextPage
    };
    var setSecondarySourceStatusOpts = {
      key: key,
      secondaryStatus: secondaryStatus
    };

    console.log('nextPage', nextPage, 'setSourceDataOpts', setSourceDataOpts);
    // commit
    this.store.commit('setSourceDataMore', setSourceDataOpts);
    this.store.commit('setSecondarySourceStatus', setSecondarySourceStatusOpts);
  };

  DataManager.prototype.defineTargets = function defineTargets (dataSourceKey, targetsDef) {
    // console.log("defineTargets: ", dataSourceKey, targetsDef)
    var state = this.store.state;
    // targets may cause a looped axios call, or may just call one once and get multiple results
    var targetsFn = targetsDef.get;
    // let targetIdFn = targetsDef.getTargetId;

    if (typeof targetsFn !== 'function') {
      throw new Error(("Invalid targets getter for data source '" + dataSourceKey + "'"));
    }
    var targets = targetsFn(state);
    var targetIdFn = targetsDef.getTargetId;

    // console.log("Define Targets Starting", targets)
    // check if target objs exist in state.
    var targetIds = targets.map(targetIdFn);
    // console.log("targetIds: ", targetIds)
    var stateTargets = state.sources[dataSourceKey].targets;
    var stateTargetIds = Object.keys(stateTargets);
    // console.log("stateTargetIds: ", stateTargetIds)
    // the inclusion check wasn't working because ids were strings in
    // one set and ints in another, so do this.
    var stateTargetIdsStr = stateTargetIds.map(String);
    var shouldCreateTargets;
    if (targetsDef.runOnce) {
      shouldCreateTargets = false;
    } else {
      shouldCreateTargets = !targetIds.every(function (targetId) {
        var targetIdStr = String(targetId);
        return stateTargetIdsStr.includes(targetIdStr);
      });
    }

    // if not, create them.
    if (shouldCreateTargets) {
      // console.log('should create targets', targetIds, stateTargetIds);
      this.store.commit('createEmptySourceTargets', {
        key: dataSourceKey,
        targetIds: targetIds
      });
    }

    if (!Array.isArray(targets)) {
      throw new Error('Data source targets getter should return an array');
    }

    // this over-rides if the targets are set to "runOnce = true"
    if (targetsDef.runOnce) {
      var idsOfOwnersOrProps = "";
      for (var i = 0, list = targets; i < list.length; i += 1) {
        var target = list[i];

          if(target.properties){
          idsOfOwnersOrProps = idsOfOwnersOrProps + "'" + target.properties.opa_account_num + "',";
        } else {
          idsOfOwnersOrProps = idsOfOwnersOrProps + "'" + target.parcel_number + "',";
        }
      }
      idsOfOwnersOrProps = idsOfOwnersOrProps.substring(0, idsOfOwnersOrProps.length - 1);
      targets = [idsOfOwnersOrProps];
    }
    // console.log("defineTargets targets: ", targets)
    return targets;
  };

  DataManager.prototype.fetchData = function fetchData () {
    // console.log('\nFETCH DATA');
    // console.log('-----------');

    var geocodeObj = this.store.state.geocode.data;
    var ownerSearchObj = this.store.state.ownerSearch.data;
    if(this.store.state.shapeSearch.data) {var shapeSearchObj = this.store.state.shapeSearch.data.rows;}

    var dataSources = this.config.dataSources || {};
    var dataSourceKeys = Object.entries(dataSources);

    for (var i$1 = 0, list$1 = dataSourceKeys; i$1 < list$1.length; i$1 += 1) {
      var ref = list$1[i$1];
        var dataSourceKey = ref[0];
        var dataSource = ref[1];

        var state = this.store.state;
      var type = dataSource.type;
      var targetsDef = dataSource.targets;

      // if the data sources specifies a features getter, use that to source
      // features for evaluating params/forming requests. otherwise,
      // default to the geocode result.
      var targets = (void 0);
      var targetIdFn = (void 0);
      var targetsFn = (void 0);

      // targets may cause a looped axios call, or may just call one once and get multiple results
      // console.log("targetsDef: ", targetsDef)
      if (targetsDef) {
        targetsFn = targetsDef.get;
        // console.log("targetsFn: ", targetsFn)
        targetIdFn = targetsDef.getTargetId;
        targets = this.defineTargets(dataSourceKey, targetsDef);
      } else if (this.store.state.lastSearchMethod !== 'owner search') {
        targets = [geocodeObj];
      } else {
        targets = [ownerSearchObj][0];
      }

      for (var i = 0, list = targets; i < list.length; i += 1) {
        // get id of target
        var target = list[i];

          var targetId = (void 0);
        if (targetIdFn && !targetsDef.runOnce) {
          targetId = targetIdFn(target, state);
        }

        // check if it's ready
        var isReady = this.checkDataSourceReady(dataSourceKey, dataSource, targetId);
        if (!isReady) {
          continue;
        }

        // update status to `waiting`
        var setSourceStatusOpts = {
          key: dataSourceKey,
          status: 'waiting'
        };
        if (targetId) {
          setSourceStatusOpts.targetId = targetId;
        }
        this.store.commit('setSourceStatus', setSourceStatusOpts);

        // if it is set up to run a single axios call on a set of targets
        if (targetsDef) {
          if (targetsDef.runOnce) {
            targetIdFn = function(feature$$1) {
              return feature$$1.parcel_number;
            };
          }
        }

        // TODO do this for all targets
        switch(type) {
          case 'http-get':
            this.clients.http.fetch(target,
                                    dataSource,
                                    dataSourceKey,
                                    targetIdFn);
            break;

          case 'http-get-nearby':
            this.clients.http.fetchNearby(target,
                                          dataSource,
                                          dataSourceKey,
                                          targetIdFn);
            break;

          case 'esri':
            // TODO add targets id fn
            this.clients.esri.fetch(target, dataSource, dataSourceKey);

            break;
          case 'esri-nearby':
            // TODO add targets id fn
            this.clients.esri.fetchNearby(target, dataSource, dataSourceKey);
            break;

          default:
            throw ("Unknown data source type: " + type);
            break;
        }// end of switch
      }// end of for targets loop
    } // end of for dataSource loop
  };

  DataManager.prototype.didFetchData = function didFetchData (key, status, data, targetId, targetIdFn) {

    // console.log("didFetchData: ", data)
    var dataOrNull = status === 'error' ? null : data;
    var stateData = dataOrNull;
    var rows;
    if (stateData) {
      rows = stateData.rows;
    }

    // if this is an array, assign feature ids
    if (Array.isArray(stateData)) {
      stateData = this.assignFeatureIds(stateData, key, targetId);
    } else if (stateData) {
      stateData.rows = this.assignFeatureIds(rows, key, targetId);
    }

    // this might cause a problem for other dataSources
    if (targetIdFn) {
      this.turnToTargets(key, stateData, targetIdFn);
    }

    // put data in state
    var setSourceDataOpts = {
      key: key,
      data: stateData,
    };
    var setSourceStatusOpts = {
      key: key,
      status: status
    };
    if (targetId) {
      setSourceDataOpts.targetId = targetId;
      setSourceStatusOpts.targetId = targetId;
    }

    // commit
    if (!targetIdFn) {
      this.store.commit('setSourceData', setSourceDataOpts);
    }
    this.store.commit('setSourceStatus', setSourceStatusOpts);

    // try fetching more data
    // console.log("Did fetch data about to try fetching more data")
    this.fetchData();
  };

  // TODO - this is probably completely wasteful
  DataManager.prototype.turnToTargets = function turnToTargets (key, stateData, targetIdFn) {
    var newLargeObj = { 'key': key };
    var newSmallObj = {};
    for (var i = 0, list = stateData; i < list.length; i += 1) {
      var theData = list[i];

        newSmallObj[theData.parcel_number] = {
        'data': theData
      };
    }
    newLargeObj['data'] = newSmallObj;
    this.store.commit('setSourceDataObject', newLargeObj);
  };

  DataManager.prototype.resetData = function resetData () {
    // console.log('resetData is running');
    var dataSources = this.config.dataSources || {};

    for (var i = 0, list = Object.keys(dataSources); i < list.length; i += 1) {
      var dataSourceKey = list[i];

        var dataSource = dataSources[dataSourceKey];
      var targetsDef = dataSource.targets;

      // null out existing data in state
      if (targetsDef) {
        this.store.commit('clearSourceTargets', {
          key: dataSourceKey
        });
        if (targetsDef.runOnce) {
          this.store.commit('setSourceStatus', {
            key: dataSourceKey,
            status: null
          });
        }
      } else {
        this.store.commit('setSourceData', {
          key: dataSourceKey,
          data: null
        });
        this.store.commit('setSourceStatus', {
          key: dataSourceKey,
          status: null
        });
      }
    }
  };

  // this gets called when the current geocoded address is wiped out, such as
  // when you click on the "Atlas" title and it navigates to an empty hash
  DataManager.prototype.resetGeocode = function resetGeocode () {
    // console.log('resetGeocode is running');
    // reset geocode
    this.store.commit('setGeocodeStatus', null);
    this.store.commit('setGeocodeData', null);
    this.store.commit('setGeocodeRelated', null);
    this.store.commit('setGeocodeInput', null);

    // reset parcels
    // if (this.config.parcels) {
    // this.store.commit('setParcelData', {
    //   parcelLayer: 'pwd',
    //   multipleAllowed: false,
    //   data: null
    // });
    // }

    if (this.store.state.map) {
      this.store.commit('setBasemap', 'pwd');
    }

    // reset data sources
    if (this.store.state.sources) {
      this.resetData();
    }
  };

  DataManager.prototype.checkDataSourcesFetched = function checkDataSourcesFetched (paths) {
      if ( paths === void 0 ) paths = [];

    // console.log('check data sources fetched', paths);

    var state = this.store.state;

    return paths.every(function (path) {
      // deps can be deep keys split on periods to get
      // a sequence of keys.
      var pathKeys = path.split('.');

      // traverse state to get the parent of the data object we need to
      // check.
      var stateObj = pathKeys.reduce(function (acc, pathKey) {
        return acc[pathKey];
      }, state);

      return stateObj.status === 'success';
    });
  };

  DataManager.prototype.checkDataSourceReady = function checkDataSourceReady (key, options, targetId) {
    // console.log(`check data source ready: ${key} ${targetId || ''}`, options);

    var deps = options.deps;
    // console.log('deps', deps);
    var depsMet = this.checkDataSourcesFetched(deps);
    // console.log('depsMet', depsMet);
    var isReady = false;

    // if data deps have been met
    if (depsMet) {
      // get the target obj
      var targetObj = this.store.state.sources[key];
      if (targetId) {
        targetObj = targetObj.targets[targetId];
      }
      // console.log("targetObj: ", targetObj)
      // if the target obj has a status of null, this data source is ready.
      isReady = !targetObj.status;
    }

    // console.log('checkDataSourceReady isReady:', isReady);
    return isReady;
  };

  DataManager.prototype.assignFeatureIds = function assignFeatureIds (features, dataSourceKey, topicId) {
    if (!features) {
      return;
    }
    var featuresWithIds = [];

    // REVIEW this was not working with Array.map for some reason
    // it was returning an object when fetchJson was used
    // that is now converted to an array in fetchJson
    for (var i = 0; i < features.length; i++) {
      var suffix = (topicId ? topicId + '-' : '') + i;
      var id = "feat-" + dataSourceKey + "-" + suffix;
      var feature$$1 = features[i];
      // console.log(dataSourceKey, feature);
      try {
        feature$$1._featureId = id;
      }
      catch (e) {
        console.warn(e);
      }
      featuresWithIds.push(feature$$1);
    }

    // console.log(dataSourceKey, features, featuresWithIds);
    return featuresWithIds;
  };

  DataManager.prototype.evaluateParams = function evaluateParams (feature$$1, dataSource) {
    // console.log("evalutateParams data-manager feature:", feature)
    var params = {};
    var paramEntries = Object.entries(dataSource.options.params);
    var state = this.store.state;

    for (var i = 0, list = paramEntries; i < list.length; i += 1) {
      var ref = list[i];
        var key = ref[0];
        var valOrGetter = ref[1];

        var val = (void 0);

      if (typeof valOrGetter === 'function') {
        val = valOrGetter(feature$$1, state);
      } else {
        val = valOrGetter;
      }

      params[key] = val;
    }

    return params;
  };

  /* GEOCODING */
  DataManager.prototype.geocode = function geocode (input) {
    // console.log('data-manager geocode is running, input:', input);
    var didTryGeocode = this.didTryGeocode.bind(this);
    var test = this.clients.geocode.fetch(input).then(didTryGeocode);
  };

  DataManager.prototype.didOwnerSearch = function didOwnerSearch () {
    // console.log("Did Owner Search")
    this.fetchData();
    console.log();
  };

  DataManager.prototype.checkForShapeSearch = function checkForShapeSearch (input) {
    // console.log("Checking for shape search", input)
    if(this.store.state.drawShape !== null ) {
      var input$1 = this.store.state.parcels.pwd;
      this.store.commit('setLastSearchMethod', 'shape search');
      var didShapeSearch = this.didShapeSearch.bind(this);
      this.store.commit('setOwnerSearchStatus', null);
      this.store.commit('setOwnerSearchData', null);
      this.store.commit('setOwnerSearchInput', null);
      this.resetGeocode();
      // console.log("Shape search input: ", input)
      return this.clients.shapeSearch.fetch(input$1).then(didShapeSearch);
    } else {
      var input$2 = this.store.state.parcels.pwd.properties.PARCELID;
      // console.log("Not shape search, input: ", input)
      this.clients.condoSearch.fetch(input$2);}
  };

  DataManager.prototype.didShapeSearch = function didShapeSearch () {
    this.fetchData();
  };

  DataManager.prototype.didTryGeocode = function didTryGeocode (feature$$1) {
    // console.log('didTryGeocode is running, feature:', feature);

    if (this.store.state.geocode.status === 'error' && typeof this.store.state.geocode.input === 'undefined') {
      //TODO set up drawShape so that after running it removes the shape, resetting the field
      // and instead shows the polygons of the parcels selected on the map
      //probably need some way to clear that too though for owner, click and address searches.

      this.checkForShapeSearch();

    } else if (this.store.state.geocode.status === 'success') {

      // console.log('didTryGeocode is running, success');

      this.resetData();
      this.didGeocode(feature$$1);
      this.store.commit('setLastSearchMethod', 'geocode');
      this.store.commit('setOwnerSearchStatus', null);
      this.store.commit('setOwnerSearchData', null);
      this.store.commit('setOwnerSearchInput', null);
      this.store.commit('setShapeSearchStatus', null);
      this.store.commit('setShapeSearchData', null);
      this.store.commit('setDrawShape', null);
      if(this.store.state.editableLayers !== null ){
        this.store.state.editableLayers.clearLayers();
      }
    } else if (this.store.state.geocode.status === null) {
      console.log('didTryGeocode is running, feature:', feature$$1);
      this.store.commit('setLastSearchMethod', 'owner search');
      if(this.store.state.editableLayers !== null ){
        this.store.state.editableLayers.clearLayers();
      }
      this.store.commit('setDrawShape', null);
      this.store.commit('setShapeSearchStatus', null);
      this.store.commit('setShapeSearchData', null);

      var input = this.store.state.geocode.input;
      this.resetGeocode();
      return this.clients.shapeSearch.fetch(input);
    } else if (this.store.state.geocode.input != null) {
      //Owner search
      this.store.commit('setLastSearchMethod', 'owner search');

      if ( this.store.state.editableLayers !== null ) {
        this.store.state.editableLayers.clearLayers();
      }
      var input$1 = this.store.state.geocode.input;
      // console.log("didTryGeocode input: ", input )

      var didOwnerSearch = this.didOwnerSearch.bind(this);
      var condoSearch = this.clients.condoSearch.fetch.bind(this.clients.condoSearch);
      var didGeocode = this.didGeocode.bind(this);
      this.resetGeocode();

      // Fail on owner search here takes you to the condo search process with the input
      return this.clients.ownerSearch.fetch(input$1).then( didOwnerSearch, function () { return condoSearch(input$1).then(didGeocode); });

    } else if (typeof feature$$1 === 'undefined' && this.store.state.ownerSearch.status != 'success') {
      // This should be the default failure for geocode and shapeSearches that may have a condo
      var input$2 =this.store.state.parcels.pwd != null ? this.store.state.parcels.pwd : this.store.state.geocode.input;
      //Check if this was a shapeSearch that may have other non-condo parcels to handle and add

      this.checkForShapeSearch(input$2);

      //Run condoSearch to find and handle condo buildings and add to the results
    } else { console.log("Unknown misc didTryGeocode failure"); }
  };

  DataManager.prototype.didGeocode = function didGeocode (feature$$1) {
    // console.log("did Geocode is running", this)
    this.controller.router.didGeocode();
    if (this.store.state.map) {
      this.store.commit('setMapZoom', 19);
      this.store.commit('setMapCenter', feature$$1.geometry.coordinates);
    }

    if (feature$$1) {
      if (feature$$1.street_address) {
        return;
      } else if (feature$$1.properties.street_address) {
        this.fetchData();
      }
      if(feature$$1.geometry.coordinates) {
        this.store.commit('setMapCenter', feature$$1.geometry.coordinates);
      }
    } else {
      this.fetchData();
    }

    if (this.store.state.lastSearchMethod === 'geocode') {
      var latLng = {lat: feature$$1.geometry.coordinates[1], lng: feature$$1.geometry.coordinates[0]};
      this.getParcelsByLatLng(latLng, 'pwd', null);
    }
  //

  }; // end didGeocode

  DataManager.prototype.getParcelsById = function getParcelsById (id, parcelLayer) {
    var url = this.config.map.featureLayers.pwdParcels.url;
    var configForParcelLayer = this.config.parcels[parcelLayer];
    var geocodeField = configForParcelLayer.geocodeField;
    var parcelQuery = esriLeaflet.query({ url: url });
    parcelQuery.where(geocodeField + " IN (" + id + ")");
    // parcelQuery.run((function(error, featureCollection, response) {
    //   console.log('171111 getParcelsById parcelQuery ran, response:', response);
    //   this.didGetParcels(error, featureCollection, response, parcelLayer);
    // }).bind(this)
    // )

    return parcelQuery.run((function(error, featureCollection$$1, response) {
        this.didGetParcelsById(error, featureCollection$$1, response, parcelLayer, fetch);
      }).bind(this)
    );
  };

  DataManager.prototype.getParcelsByLatLng = function getParcelsByLatLng (latlng, parcelLayer, fetch) {
    // console.log('getParcelsByLatLng, latlng:', latlng, 'parcelLayer:', this.config.map.featureLayers, 'fetch:', fetch, 'this.config.map.featureLayers:', this.config.map.featureLayers);
    var latLng = L.latLng(latlng.lat, latlng.lng);
    var url = this.config.map.featureLayers.pwdParcels.url;
    var parcelQuery = esriLeaflet.query({ url: url });
    // console.log(parcelQuery);
    parcelQuery.contains(latLng);
    parcelQuery.run((function(error, featureCollection$$1, response) {
        this.didGetParcels(error, featureCollection$$1, response, parcelLayer, fetch);
      }).bind(this)
    );
  };

  DataManager.prototype.getParcelsByShape = function getParcelsByShape (latlng, parcelLayer) {

    // console.log("Testing DrawnShape Geocoder", latlng._latlngs)

    var latLng = L.polygon(latlng._latlngs, latlng.options);
    var url = this.config.map.featureLayers.pwdParcels.url;

    var parcelQuery = esriLeaflet.query({ url: url });
    parcelQuery.intersects(latLng);

    parcelQuery.run((function(error, featureCollection$$1, response) {
        this.didGetParcelsByShape(error, featureCollection$$1, response, parcelLayer, fetch);
      }).bind(this)
    );

  };

  DataManager.prototype.didGetParcels = function didGetParcels (error, featureCollection$$1, response, parcelLayer, fetch) {
    // console.log('180405 didGetParcels is running parcelLayer', parcelLayer, 'fetch', fetch, 'response', response);
    var configForParcelLayer = this.config.parcels.pwd;
    var geocodeField = configForParcelLayer.geocodeField;
    var otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);
    var lastSearchMethod = this.store.state.lastSearchMethod;

    // console.log('didGetParcels - parcelLayer:', parcelLayer, 'otherParcelLayers:', otherParcelLayers, 'configForParcelLayer:', configForParcelLayer);

    if (error) {
      // update state
      if (configForParcelLayer.clearStateOnError) {
      // this.store.commit('setParcelData', { parcelLayer, [] });
      // this.store.commit('setParcelStatus', { parcelLayer }, 'error' });
      }
      return;
    }

    if (!featureCollection$$1) {
      return;
    }

    var features = featureCollection$$1.features;
    // console.log('featureCollection: ', featureCollection.features, 'features: ', features);
    if (features.length === 0) {
      return;
    }

    var feature$$1 = features[0];
    var coords = feature$$1.geometry.coordinates;
    // use turf to get area and perimeter of all parcels returned

    // console.log('feature:', feature, 'coords.length:', coords.length);
    if (coords.length > 1) {
      var distances = [];
      var areas = [];
      for (var i = 0, list = coords; i < list.length; i += 1) {
        var coordsSet = list[i];

          console.log('coordsSet:', coordsSet);
        var turfPolygon = polygon(coordsSet);
        distances.push(this.getDistances(coordsSet).reduce(function(acc, val) { return acc + val; }));
        areas.push(area(turfPolygon) * 10.7639);
      }
      feature$$1.properties.TURF_PERIMETER = distances.reduce(function(acc, val) { return acc + val; });
      feature$$1.properties.TURF_AREA = areas.reduce(function(acc, val) { return acc + val; });
    } else {
      // console.log('coords:', coords);
      var turfPolygon$1 = polygon(coords);
      var distances$1 = this.getDistances(coords);
      feature$$1.properties.TURF_PERIMETER = distances$1.reduce(function(acc, val) { return acc + val; });
      feature$$1.properties.TURF_AREA = area(turfPolygon$1) * 10.7639;
    }
    // console.log('after calcs, feature:', feature);

    // at this point there is definitely a feature or features - put it in state

    this.setParcelsInState(parcelLayer, feature$$1);
    // console.log("setParcelsInState: ", parcelLayer, feature);

    // shouldGeocode - true only if:
    // 1. didGetParcels is running because the map was clicked (lastSearchMethod = reverseGeocode)
    var shouldGeocode = (
      lastSearchMethod === 'reverseGeocode'
    );

    // console.log('didGetParcels - shouldGeocode is', shouldGeocode);
    if (shouldGeocode) {
      // since we definitely have a new parcel, and will attempt to geocode it:
      // 1. wipe out state data on other parcels
      // 2. attempt to replace
      // if (lastSearchMethod === 'reverseGeocode') { // || !configForParcelLayer.wipeOutOtherParcelsOnReverseGeocodeOnly) {
      var clickCoords = this.store.state.clickCoords;
      var coords$1 = [clickCoords.lng, clickCoords.lat];
      var ref = coords$1;
        var lng = ref[0];
        var lat = ref[1];
      var latlng = L.latLng(lat, lng);
      var props = feature$$1.properties || {};
      var id = props[geocodeField];
      // console.log("id", id);
      // console.log('Line 701 data-manager.js didGetParcels - if shouldGeocode is running through router');
      if (id) { this.controller.router.routeToAddress(id); }
    } else {
      // console.log('180405 data-manager.js didGetParcels - if shouldGeocode is NOT running');
      // if (lastSearchMethod != 'reverseGeocode-secondAttempt') {
      // if (fetch !== 'noFetch') {
      if (fetch !== 'noFetch' && lastSearchMethod != 'reverseGeocode-secondAttempt') {
        // console.log('180405 data-manager.js - didGetParcels - is calling fetchData() on feature w address', feature.properties.street_address);
        this.fetchData();
      }
    }
  };

  DataManager.prototype.didGetParcelsByShape = function didGetParcelsByShape (error, featureCollection$$1, response, parcelLayer, fetch) {

    // console.log('180405 didGetParcels is running parcelLayer', parcelLayer, 'fetch', fetch, 'response', response);

    var configForParcelLayer = this.config.parcels.pwd;
    var geocodeField = configForParcelLayer.geocodeField;
    var otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);
    var lastSearchMethod = this.store.state.lastSearchMethod;

    // console.log('didGetParcels - parcelLayer:', parcelLayer, 'otherParcelLayers:', otherParcelLayers, 'configForParcelLayer:', configForParcelLayer);

    if (error) {
      if (configForParcelLayer.clearStateOnError) {
      }
      return;}
      if (!featureCollection$$1) {return;}

      var features = featureCollection$$1.features;

      if (features.length === 0) { return;}
      // at this point there is definitely a feature or features - put it in state
      this.setParcelsInState(parcelLayer, features);
      this.geocode(features);

      // this.fetchData();
  };
  DataManager.prototype.didGetParcelsById = function didGetParcelsById (error, featureCollection$$1, response, parcelLayer, fetch) {

    // console.log('180405 didGetParcels is running parcelLayer', parcelLayer, 'fetch', fetch, 'response', response);

    var configForParcelLayer = this.config.parcels.pwd;
    var geocodeField = configForParcelLayer.geocodeField;
    var otherParcelLayers = Object.keys(this.config.parcels || {});
    otherParcelLayers.splice(otherParcelLayers.indexOf(parcelLayer), 1);
    var lastSearchMethod = this.store.state.lastSearchMethod;

    // console.log('didGetParcels - parcelLayer:', parcelLayer, 'otherParcelLayers:', otherParcelLayers, 'configForParcelLayer:', configForParcelLayer);

    if (error) {
      if (configForParcelLayer.clearStateOnError) {
      }
      return;}
      if (!featureCollection$$1) {return;}

      var features = featureCollection$$1.features;

      if (features.length === 0) { return;}
      // at this point there is definitely a feature or features - put it in state
      this.setParcelsInState(parcelLayer, features);
  };

  DataManager.prototype.getDistances = function getDistances (coords) {
    var turfCoordinates = [];
    for (var i$1 = 0, list = coords[0]; i$1 < list.length; i$1 += 1) {
      var coordinate = list[i$1];

        turfCoordinates.push(point(coordinate));
    }
    var distances = [];
    for (var i=0; i<turfCoordinates.length - 1; i++) {
      distances[i] = distance(turfCoordinates[i], turfCoordinates[i+1], {units: 'feet'});
    }
    return distances;
  };

  DataManager.prototype.setParcelsInState = function setParcelsInState (parcelLayer, feature$$1) {
    var payload;
    // pwd

    payload = {
      parcelLayer: parcelLayer,
      data: feature$$1
    };

    // update state
    this.store.commit('setParcelData', payload);
  };

  /*
  The Controller handles events from the UI that have some effect on routing or
  data fetching. It is a "thin" class that mostly proxies events to the router and
  data manager, and facilitates communication between them.
  */

  var Controller = function Controller(opts) {
    var store = this.store = opts.store;
    var config = this.config = opts.config;
    // const eventBus = this.eventBus = opts.eventBus;
    this.history = window.history;

    // the router and data manager need a ref to the controller
    opts.controller = this;

    // create data manager
    var dataManager = this.dataManager = new DataManager(opts);

    // create router
    opts.dataManager = dataManager;
    this.router = new Router(opts);
  };

  /*
  EVENT HANDLERS
  */

  Controller.prototype.activeFeatureChange = function activeFeatureChange (){
    this.dataManager.fetchRowData();
  };

  Controller.prototype.appDidLoad = function appDidLoad () {
    // route once on load
    this.router.hashChanged();
  };

  Controller.prototype.test = function test () {
    console.log('controller test is firing');
  };

  Controller.prototype.getMoreRecords = function getMoreRecords (dataSource, highestPageRetrieved) {
    this.dataManager.fetchMoreData(dataSource, highestPageRetrieved);
  };

  Controller.prototype.filterInputSubmit = function filterInputSubmit (value, process, searchCategory) {
    // console.log('controller filterInputSubmit is running, value:', value, 'process:', process);
    if (process === 'mapboard') {
      this.handleSearchFormSubmit(value);
    } else {
      this.handleConfigurableInputSubmit(value, searchCategory);
    }
  };

  Controller.prototype.handleSearchFormSubmit = function handleSearchFormSubmit (value, searchCategory) {
    var input = value;
    // console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is running', value, this);

    this.store.commit('setGeocodeStatus', null);
    this.store.commit('setGeocodeInput', input);

    this.store.commit('setShouldShowAddressCandidateList', false);
    if (this.store.state.lastSearchMethod) {
      this.store.commit('setLastSearchMethod', 'geocode');
    }
    if (this.store.state.clickCoords) {
      this.store.commit('setClickCoords', null);
    }

    // clear out state
    var parcelLayer = Object.keys(this.config.parcels || {});
    var payload = {
      parcelLayer: parcelLayer,
      data: null
    };
    // update state
    this.store.commit('setParcelData', payload);

    // tell router
    // console.log('phila-vue-datafetch controller.js, handleSearchFormSubmit is about to call routeToAddress, input:', input);
    this.router.routeToAddress(input, searchCategory);
  };

  Controller.prototype.handleMapClick = function handleMapClick (e) {
    // console.log('handle map click', e, this);

    // TODO figure out why form submits via enter key are generating a map
    // click event and remove this
    if (e.originalEvent.keyCode === 13) {
      return;
    }
    this.store.commit('setLastSearchMethod', 'reverseGeocode');
    this.store.commit('setClickCoords', null);

    // get parcels that intersect map click xy
    var latLng = e.latlng;
    this.store.commit('setClickCoords', latLng);
    this.store.commit('setGeocodeInput', null);

    var parcels = this.store.state.parcels;
    // console.log('in handleMapClick, latlng:', latLng, 'parcels:', parcels);
    this.dataManager.getParcelsByLatLng(latLng, parcels);
  };
  Controller.prototype.geocodeDrawnShape = function geocodeDrawnShape (state) {
    var shape = this.store.state.drawShape;
    var parcels = [];
    this.dataManager.getParcelsByShape(shape, parcels);
  };
  Controller.prototype.geocodeOwnerSearch = function geocodeOwnerSearch (state) {
    console.log("ownerSearch data:", this.store.state.ownerSearch.data);
    var ids = this.store.state.ownerSearch.data.map(function (item) { return item.properties.pwd_parcel_id; });

    var feature = this.dataManager.getParcelsById(ids, 'pwd');

    if( feature.response !== undefined) {
      this.store.commit('setGeocodeData', feature.response);
    }
  };

  Controller.prototype.goToDefaultAddress = function goToDefaultAddress (address) {
    this.router.routeToAddress(address);
  };

  var initialState = {

    clickCoords: null,
    // should addresscandidate be here if neither pvm or pvc were included?
    shouldShowAddressCandidateList: false,
    // the ais feature
    geocode: {
      status: null,
      data: null,
      input: null,
      related: null,
    },
    ownerSearch: {
      status: null,
      data: null,
      input: null,
    },
    activeSearch: {
    },
    shapeSearch: {
      status: null,
      data: null,
      input: null,
      units: null,
    },
    lastSearchMethod: 'geocode',
  };

  var pvdStore = {
    createSources: function createSources(config) {
      // console.log('createSources is running, config:', config);
      var sourceKeys = Object.keys(config.dataSources || {});
      var sources = sourceKeys.reduce(function (o, key) {
        var val;
        // if the source has targets, just set it to be an empty object
        if (config.dataSources[key].targets) {
          // console.log('in config.dataSources[key].targets:', config.dataSources[key].targets);
          val = {
            targets: {}
          };
        } else {
          val = {
           // we have to define these here, because vue can't observe properties that
           // are added later.
           status: null,
           secondaryStatus: null,
           data: null
         };
        }

        o[key] = val;

        return o;
      }, {});
      return sources;
    },
    createActivesearch: function createActivesearch(config) {
      // console.log('createSources is running, config:', config);
      var sourceKeys = Object.keys(config.activeSearch || {});
      var sources = sourceKeys.reduce(function (o, key) {
        var val = {
           status: null,
           data: null
         };
        o[key] = val;
        return o;
      }, {});
      return sources;
    },

    createParcels: function createParcels(config) {
      var parcelKeys = Object.keys(config.parcels || {});
      var parcels = parcelKeys.reduce(function (o, key) {
        o[key] = null;
        return o;
      }, {});
      return parcels;
    },

    store: {
      state: initialState,
      mutations: {
        setClickCoords: function setClickCoords(state, payload) {
          state.clickCoords = payload;
        },
        setSourceStatus: function setSourceStatus(state, payload) {
          // console.log('setSourceStatus is running, payload:', payload);
          var key = payload.key;
          var status = payload.status;

          // if a target id was passed in, set the status for that target
          var targetId = payload.targetId;

          if (targetId) {
            // console.log('store.js setSourceStatus, key:', key, 'status:', status, 'targetId:', targetId);
            state.sources[key].targets[targetId].status = status;
          } else {
            state.sources[key].status = status;
          }
        },
        setSecondarySourceStatus: function setSecondarySourceStatus(state, payload) {
          var key = payload.key;
          var secondaryStatus = payload.secondaryStatus;

          // if a target id was passed in, set the status for that target
          var targetId = payload.targetId;

          // if (targetId) {
          //   state.sources[key].targets[targetId].status = status;
          // } else {
          state.sources[key].secondaryStatus = secondaryStatus;
          // }
        },
        setSourceData: function setSourceData(state, payload) {
          // console.log('store setSourceData payload:', payload);
          var key = payload.key;
          var data = payload.data;

          // if a target id was passed in, set the data object for that target
          var targetId = payload.targetId;

          if (targetId) {
            if (state.sources[key].targets[targetId]) {
              state.sources[key].targets[targetId].data = data;
            }
          } else {
            state.sources[key].data = data;
          }
        },
        setSourceDataObject: function setSourceDataObject(state, payload) {
          var key = payload.key;
          var data = payload.data;
          state.sources[key].targets = data;
        },
        setSourceDataMore: function setSourceDataMore(state, payload) {
          var key = payload.key;
          var data = payload.data;
          var nextPage = payload.page;
          var oldData = state.sources[key].data;
          // console.log('oldData features', oldData.features, 'data features', data.features);
          var allData = oldData.features.concat(data.features);
          // console.log('allData', allData);
          // if a target id was passed in, set the data object for that target
          // const targetId = payload.targetId;

          // if (targetId) {
          //   state.sources[key].targets[targetId].data = data;
          // } else {

          state.sources[key].data.features = allData;
          state.sources[key].data.page = nextPage;
          // }
        },
        // this sets empty targets for a data source
        createEmptySourceTargets: function createEmptySourceTargets(state, payload) {
          var key = payload.key;
          var targetIds = payload.targetIds;
          state.sources[key].targets = targetIds.reduce(function (acc, targetId) {
            acc[targetId] = {
              status: null,
              data: null
            };
            return acc;
          }, {});
        },
        clearSourceTargets: function clearSourceTargets(state, payload) {
          var key = payload.key;
          state.sources[key].targets = {};
        },
        // this is the map center as an xy coordinate array (not latlng)
        setMapCenter: function setMapCenter(state, payload) {
          state.map.center = payload;
        },
        setMapZoom: function setMapZoom(state, payload) {
          state.map.zoom = payload;
        },
        setParcelData: function setParcelData(state, payload) {
          // console.log('payload :', payload);
          var ref = payload || {};
          var data = ref.data;
          // console.log('store setParcelData parcelLayer:', parcelLayer, 'data:', data, 'status:', status, 'activeParcel:', activeParcel);
          state.parcels.pwd = data;
        },
        setLastSearchMethod: function setLastSearchMethod(state, payload) {
          state.lastSearchMethod = payload;
        },
        setGeocodeStatus: function setGeocodeStatus(state, payload) {
          state.geocode.status = payload;
        },
        setGeocodeData: function setGeocodeData(state, payload) {
          state.geocode.data = payload;
        },
        setGeocodeRelated: function setGeocodeRelated(state, payload) {
          state.geocode.related = payload;
        },
        setGeocodeInput: function setGeocodeInput(state, payload) {
          state.geocode.input = payload;
        },
        setOwnerSearchStatus: function setOwnerSearchStatus(state, payload) {
          state.ownerSearch.status = payload;
        },
        setOwnerSearchData: function setOwnerSearchData(state, payload) {
          state.ownerSearch.data = payload;
        },
        setShapeSearchStatus: function setShapeSearchStatus(state, payload) {
          state.shapeSearch.status = payload;
        },
        setShapeSearchData: function setShapeSearchData(state, payload) {
          state.shapeSearch.data = payload;
        },
        setShapeSearchUnits: function setShapeSearchUnits(state, payload) {
          // console.log("setShapeSearchUnits: ", payload)
          state.shapeSearch.units = payload;
        },
        setActiveSearchStatus: function setActiveSearchStatus(state, payload) {
          var key = payload.activeSearchKey;
          state.activeSearch[payload.activeSearchKey].status = payload.status;
        },
        setActiveSearchData: function setActiveSearchData(state, payload) {
          var key = payload.activeSearchKey;
          var data = payload.data;
          state.activeSearch[key].data = data;
        },
        setDrawShape: function setDrawShape(state, payload) {
          state.drawShape.data = payload;
        },
        setOwnerSearchInput: function setOwnerSearchInput(state, payload) {
          state.ownerSearch.input = payload;
        },
        setBasemap: function setBasemap(state, payload) {
          state.map.basemap = payload;
        },
        setImagery: function setImagery(state, payload) {
          state.map.imagery = payload;
        },
        setShouldShowImagery: function setShouldShowImagery(state, payload) {
          state.map.shouldShowImagery = payload;
        },
        setShouldShowAddressCandidateList: function setShouldShowAddressCandidateList(state, payload) {
          state.shouldShowAddressCandidateList = payload;
        },
      }
    }
  };

  function controllerMixin(Vue, opts) {
    var controller = new Controller(opts);

    Vue.mixin({
      created: function created() {
        this.$controller = controller;
      }
    });
  }

  var controllerMixin$1 = { controllerMixin: controllerMixin, pvdStore: pvdStore };

  exports.default = controllerMixin$1;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=phila-vue-datafetch.js.map
