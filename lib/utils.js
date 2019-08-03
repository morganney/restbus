var zlib = require('zlib');
var js4xml = require('xml2js').parseString;
var options = {
  hostname: 'webservices.nextbus.com',
  headers: {'accept-encoding':'gzip,deflate'}
  // Make http request to NextBus use 'Connection: close' instead of 'Connection: keep-alive'
  // Might help with avoiding the weird node.js error when restarting server (and/or changing NODE_ENV):
  //
  // Error: read ECONNRESET
  // at errnoException (net.js:901:11)
  // at TCP.onread (net.js:556:19)
  //
  // @see http://nodejs.org/api/http.html#http_http_request_options_callback
  // agent: false
};
var utils = {};

utils.c = {
  NEXTBUS_XMLFEED: '/service/publicXMLFeed',
  MTJSON: 'application/json',
  RTE: 'route',
  VEH: 'vehicle',
  PRED: 'prediction',
  AGY: 'agency'
};

utils.errors = (function() {
  var error = {};

  return {
    get: function(status, msg) {
      switch(parseInt(status, 10)) {
        case 400:
          this.set(400, 'Bad Request', msg);
          break;
        case 404:
          this.set(404, 'Not Found', msg);
          break;
        case 405:
          this.set(405, 'Method Not Allowed', msg);
          break;
        case 500:
          this.set(500, 'Internal Server Error', msg);
          break;
        case 503:
          this.set(503, 'Service Unavailable', msg);
          break;
        default:
          this.set(
            500,
            'Internal Server Error',
            'The server encountered an unexpected condition which prevented it from fulfilling the request.'
          );
          break;
      }

      return error;
    },
    set: function(status, desc, msg) {
      error.status = status;
      error.statusDesc = desc;
      error.message = msg || 'HTTP Error.';
    }
  };

}());

utils.getJsFromXml = function (res, callback) {
  var encoding = res.headers['content-encoding'],
      stream = res,
      xml = '';

  if(encoding === 'gzip' || encoding === 'deflate') {
    // Set the stream to zlib.Unzip object to handle both encodings.
    stream = zlib.createUnzip();
    // Pipe the compressed response from NextBus to the unzip stream.
    res.pipe(stream);
  }

  stream.on('data', function(d) { if(d) xml += d.toString(); });

  stream.on('end', function() {
    try {
      js4xml(xml, function(err, js) {
        if(err) callback(err, {errtype: 'parse'});
        else if(!js || typeof js.body === 'undefined') {
          console.error(JSON.stringify(js));
          callback({message: 'No "body" element in NextBus XML document'}, {errtype: 'parse'});
        } else callback(null, js);
      });
    } catch (err) {
      callback(err, {errtype: 'parse'});
    }
  });

  stream.on('error', function(e) {
    console.error(e.stack);
    callback(e, {errtype: 'stream'});
  });
};

utils.getOptionsWithPath = function(path) {
  options.path = path;
  return options;
};

utils.nbRequestError = function(e, res) {
  var host = options.hostname;

  console.error(e.stack);
  res.status(500).json(this.errors.get(500, 'Unable to fulfill request to ' + host + '. ' + e.message));
};

utils.streamOrParseError = function(e, js, res) {
  if(js.errtype === 'parse') {
    res.status(500).json(this.errors.get(500, 'Unable to parse XML into JavaScript. ' + e.message));
  } else {
    res.status(500).json(this.errors.get(500, 'An unexpected stream error has occured. ' + e.message));
  }
};

/**
 * Sends appropriate HTTP error response for a NextBus XML error. This is usually a 404, but if
 * the XML Error element's shouldRetry attribute == true, then its a 503 error.
 *
 * Currently deals with all the inconsistent ways NextBus embeds error messages
 * into the XML content (instead of with HTTP headers, etc.). Also trys to
 * replace query string terminology with RESTful jargon.
 *
 * TODO: Find a more efficient/sophisticated way to do string replacement with regex.
 *
 * @param {Object:e} The NextBus XML error parsed from xml2js into a JS object.
 * @param {Object:res} The HTTP response stream (http.ServerResponse).
 */
utils.nbXmlError = function(e, res) {
  var emsg = e._;

  if(e.$.shouldRetry === 'false') {
    emsg = emsg.replace('a=','').replace('parameter','id').replace('tag', 'id').replace('tags', 'ids');
    emsg = emsg.replace('agency=', 'agency id ').replace('s=', '').replace('route r=', 'route ').replace('r=', 'route ');
    emsg = emsg.replace('stopId=', 'stop code id ').replace('vehicle=', 'vehicle id ');
    res.status(404).json(this.errors.get(404, emsg));
  } else {
    res.status(503).json(this.errors.get(503, emsg));
  }
};

utils.addOptionalSlash = function(str) {
  var s = str;

  if(str.substr(-1) !== '/') s += '/';

  return s;
};

utils.removeOptionalSlash = function(str) {
  var s = str;

  if(str.substr(-1) === '/') s = str.substr(0, str.length - 1);

  return s;
};

utils.getOpenPath = function(req) {
  var host = req.get('host'),
      path = [req.protocol, '://', host, req.originalUrl].join('');

  if(path.substr(-1) === '/') path = path.substr(0, path.length - 1);

  return path;
};

utils.getClosedPath = function(req) {
  var host = req.get('host'),
      path = [req.protocol, '://', host, req.originalUrl].join('');

  if(path.substr(-1) !== '/') path += '/';

  return path;
};

module.exports = utils;
