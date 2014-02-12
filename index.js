var express = require('express'),
    api = require('./lib/api'),
    utils = require('./lib/utils'),
    proxy = express(),
    restbus = {};

// Configuration & Middleware
if(proxy.get('env') === 'development') {
  proxy.use(express.logger('dev'));
  proxy.use(express.errorHandler({showStack: true, dumpExceptions: true}));
  proxy.use(function(err, req, res, next) {
    console.error(err.stack);
    res.json(500, utils.errors.get(500, 'The server encountered an unexpected condition: ' + err.message));
  });
} else {
  proxy.use(express.logger());
  proxy.use(function(err, req, res, next) {
    res.json(500, utils.errors.get(500, 'The server encountered an unexpected condition: ' + err.message));
  });
}

proxy.use(express.compress());
proxy.use(function(req, res, next) {
  res.set({// No client caching
    'Expires': 'Sat, 01 Jan 2000 08:00:00 GMT',
    'Last-Modified': new Date().toUTCString(),
    'Cache-Control': 'max-age=0, no-cache, must-revalidate, proxy-revalidate'
  });
  next();
});
proxy.use(proxy.router);
proxy.use(function(req, res, next) {
  res.json(404, utils.errors.get(404, 'The requested URI can not be found on this server.'));
});

// Routing (only GET requests supported)
proxy.get('/agencies', api.agencies.list);
proxy.get('/agencies/:agency', api.agencies.get);
proxy.get('/agencies/:agency/routes', api.routes.list);
proxy.get('/agencies/:agency/routes/:route', api.routes.get);
proxy.get('/agencies/:agency/vehicles', api.vehicles.list);
proxy.get('/agencies/:agency/vehicles/:vehicle', api.vehicles.get);
proxy.get('/agencies/:agency/routes/:route/vehicles', api.vehicles.routelist);
proxy.get('/agencies/:agency/stops/:code/predictions', api.predictions.list);
proxy.get('/agencies/:agency/tuples/:tuples/predictions', api.predictions.tuples);
proxy.get('/agencies/:agency/routes/:route/stops/:stop/predictions', api.predictions.get);
proxy.get('/locations/:latlon/predictions', api.predictions.location);

restbus.listen = function(port) {
  var p = port || '3535';

  proxy.listen(p, function() { console.log('restbus started and listening on port ' + p); });
};

module.exports = restbus;