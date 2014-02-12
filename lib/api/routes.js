var http = require('http'),
    utils = require('../utils'),
    NBXML_FEED = utils.c.NEXTBUS_XMLFEED,
    routes = {};

routes.list = function(req, res) {
  var path = [NBXML_FEED, '?command=routeList&a=', req.params.agency].join('');

  http.get(utils.getOptionsWithPath(path), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = [], nberr;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0]
        if(!nberr) {
          js.body.route.forEach(function(route) {
            var $ = route.$;

            json.push({ id: $.tag, title: $.title });
          });
          res.json(200, json);
        } else utils.nbXmlError(nberr, res);
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

routes.get = function(req, res) {
  var p = req.params, path = [NBXML_FEED, '?command=routeConfig&a=', p.agency, '&r=', p.route].join('');

  http.get(utils.getOptionsWithPath(path), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = {}, route, $, nberr;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0]
        if(!nberr) {
          route = js.body.route[0];
          $ = route.$;

          // Build route properties.
          json.id = $.tag;
          json.title = $.title;
          json.shortTitle = (!$.shortTitle || $.shortTitle === ' ') ? null : $.shortTitle;
          json.color = '#' + $.color;
          json.textColor = '#' + $.oppositeColor;
          json.bounds = {
            sw: {lat: parseFloat($.latMin), lon: parseFloat($.lonMin)},
            ne: {lat: parseFloat($.latMax), lon: parseFloat($.lonMax)}
          };

          // Build route stops.
          json.stops = [];
          route.stop.forEach(function(stop) {
            var $ = stop.$, lat = parseFloat($.lat), lon = parseFloat($.lon),
                code = (!$.stopId || $.stopId === ' ') ? null : $.stopId;

            json.stops.push({ id: $.tag, code: code, title: $.title, lat: lat, lon: lon });
          });

          // Build route directions.
          json.directions = [];
          route.direction.forEach(function(direction) {
            var $ = direction.$,
                useForUi = $.useForUI === 'true' ? true : false,
                shortTitle = (!$.name || $.name === ' ') ? null : $.name,
                d = { id: $.tag, title: $.title, shortTitle: shortTitle, useForUi: useForUi };

            d.stops = [];
            if(direction.stop && direction.stop.forEach) {
              direction.stop.forEach(function(stop) { d.stops.push(stop.$.tag); });
            }
            json.directions.push(d);
          });

          // Build the route paths.
          json.paths = [];
          route.path.forEach(function(path) {
            var points = [];
            path.point.forEach(function(point) {
              points.push({ lat: parseFloat(point.$.lat), lon: parseFloat(point.$.lon) });
            });
            json.paths.push({ points: points });
          });

          res.json(200, json);
        } else utils.nbXmlError(nberr, res);
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

module.exports = routes;