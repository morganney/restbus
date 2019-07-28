var http = require('http');
var express = require('express');
var logger = require('morgan');
var compression = require('compression');
var errorhandler = require('errorhandler');
var api = require('./api');
var utils = require('./utils');
var app = express();
var router = express.Router();
var proxy = http.createServer(app);
var sockets = [];
var listening = false;
var demo = false;
var restbus = {};

function addSocket(socket) { sockets.push(socket); }

app.enable('trust proxy');

// Configuration & Middleware
if(app.get('env') === 'development') {
  router.use(logger('dev'));
  router.use(errorhandler({showStack: true, dumpExceptions: true}));
  router.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500).json(utils.errors.get(500, 'The server encountered an unexpected condition: ' + err.message));
  });
} else {
  router.use(logger('combined'));
  router.use(function(err, req, res, next) {
    res.status(500).json(utils.errors.get(500, 'The server encountered an unexpected condition: ' + err.message));
  });
}

router.use(compression());
router.use(function(req, res, next) {
  if(req.method.toLowerCase() === 'options') {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Content-Length,X-Requested-With',
      'Access-Control-Allow-Credentials': false,
      'Allow': 'GET'
    });
    res.sendStatus(200);
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

// API Routing (only GET requests supported)
router.get('/agencies', api.agencies.list);
router.get('/agencies/:agency', api.agencies.get);
router.get('/agencies/:agency/routes', api.routes.list);
router.get('/agencies/:agency/routes/:route', api.routes.get);
router.get('/agencies/:agency/vehicles', api.vehicles.list);
router.get('/agencies/:agency/vehicles/:vehicle', api.vehicles.get);
router.get('/agencies/:agency/routes/:route/vehicles', api.vehicles.routelist);
router.get('/agencies/:agency/stops/:code/predictions', api.predictions.list);
router.get('/agencies/:agency/tuples/:tuples/predictions', api.predictions.tuples);
router.get('/agencies/:agency/routes/:route/stops/:stop/predictions', api.predictions.get);
router.get('/locations/:latlon/predictions', api.predictions.location);

// Handle bad requests
router.use(function(req, res, next) {
  var method = req.method;

  if(method.toLowerCase() !== 'get') {
    res.status(405).json(utils.errors.get(405, 'HTTP method ' + method + ' is not supported by this URI resource.'));
  } else {
    res.status(404).json(utils.errors.get(404, 'The requested URI can not be found on this server.'));
  }
});

// Mount the router at '/'
app.use(router);

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

restbus.middleware = function() {
  return router;
};

module.exports = restbus;
