var http = require('http'),
    express = require('express'),
    api = require('./lib/api'),
    utils = require('./lib/utils'),
    app = express(),
    proxy = http.createServer(app),
    sockets = [],
    listening = false,
    demo = false,
    restbus = {};

function addSocket(socket) { sockets.push(socket); }

app.enable('trust proxy');

// Configuration & Middleware
if(app.get('env') === 'development') {
  app.use(express.logger('dev'));
  app.use(express.errorHandler({showStack: true, dumpExceptions: true}));
  app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.json(500, utils.errors.get(500, 'The server encountered an unexpected condition: ' + err.message));
  });
} else {
  app.use(express.logger());
  app.use(function(err, req, res, next) {
    res.json(500, utils.errors.get(500, 'The server encountered an unexpected condition: ' + err.message));
  });
}

app.use(express.compress());
app.use(function(req, res, next) {
  if(req.method.toLowerCase() === 'options') {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Content-Length,X-Requested-With',
      'Access-Control-Allow-Credentials': false,
      'Allow': 'GET'
    });
    res.send(200);
  } else {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Expires': 'Sat, 01 Jan 2000 08:00:00 GMT',
      'Last-Modified': new Date().toUTCString(),
      'Cache-Control': 'max-age=0, no-cache, must-revalidate, proxy-revalidate'
    });
    next();
  }
});
app.use(app.router);
app.use(function(req, res, next) {
  var method = req.method;

  if(method.toLowerCase() !== 'get') {
    res.json(405, utils.errors.get(405, 'HTTP method ' + method + ' is not supported by this URI resource.'));
  } else {
    res.json(404, utils.errors.get(404, 'The requested URI can not be found on this server.'));
  }
});

// Routing (only GET requests supported)
app.get('/agencies', api.agencies.list);
app.get('/agencies/:agency', api.agencies.get);
app.get('/agencies/:agency/routes', api.routes.list);
app.get('/agencies/:agency/routes/:route', api.routes.get);
app.get('/agencies/:agency/vehicles', api.vehicles.list);
app.get('/agencies/:agency/vehicles/:vehicle', api.vehicles.get);
app.get('/agencies/:agency/routes/:route/vehicles', api.vehicles.routelist);
app.get('/agencies/:agency/stops/:code/predictions', api.predictions.list);
app.get('/agencies/:agency/tuples/:tuples/predictions', api.predictions.tuples);
app.get('/agencies/:agency/routes/:route/stops/:stop/predictions', api.predictions.get);
app.get('/locations/:latlon/predictions', api.predictions.location);

/**
 * Method for starting restbus.
 *
 * @param {String:port} The port to start restbus on. Optional, defaults to '3535'.
 * @param {Function:callback} An optional callback for the 'listening' event.
 */
restbus.listen = function(port, callback) {
  var p, cb;

  if(typeof port === 'function') {
    p = '3535';
    cb = port;
  } else {
    p = port || '3535';
    cb = typeof callback === 'function' ? callback : function() {};
  }

  if((arguments.length === 3) && (arguments[2] === true)) {
    demo = true;
    proxy.on('connection', addSocket);
  }

  if(listening) {
    cb(p);
  } else {
    proxy.listen(p, function() {
      listening = true;
      cb(p);
    });
  }
};

restbus.close = function(callback) {
  var cb = typeof callback === 'function' ? callback : function() {};

  if(!demo) restbus.close = function() {console.log('Can only call restbus.close() once!')};

  if(!listening) {
    cb();
  } else {
    proxy.close(function() {
      listening = false;
      cb();
    });
    if(demo) {
      demo = false;
      proxy.removeListener('connection', addSocket);
      sockets.forEach(function(socket) {
        if(socket) socket.destroy();
      });
      sockets = [];
    }
  }
};

restbus.isListening = function() {
  return listening;
};

module.exports = restbus;