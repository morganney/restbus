var http = require('http');
var utils = require('../utils');
var C = utils.c;
var NBXML_FEED = C.NEXTBUS_XMLFEED;
var routes = {};

function getLinks(hrefs, rte, req) {
  var predictions = [],
      params = req.params,
      a = params.agency,
      to = [{
        href: hrefs.vehicle,
        type: C.MTJSON,
        rel: 'related',
        rt: C.VEH,
        title: ['A collection of vehicles for ', a, ' route ', rte.title , '.'].join('')
      }];

  hrefs.stops.forEach(function(stop) {
    var p = {};

    p.href = [hrefs.self, '/stops/', stop.id, '/predictions'].join('');
    p.type = C.MTJSON;
    p.rel = 'related';
    p.rt = C.PRED;
    p.title = ['A collection of predictions for stop ', stop.id, ' on ', a, ' route ', rte.id, '.'].join('');

    predictions.push(p);
  });

  to = to.concat(predictions);

  return {
    self: {
      href: hrefs.self,
      type: C.MTJSON,
      rel: 'self',
      rt: C.RTE,
      title: ['Full configuration for ', a, ' route ', rte.title , '.'].join('')
    },
    to: to,
    from: [
      {
        href: hrefs.route,
        type: C.MTJSON,
        rel: 'via',
        rt: C.RTE,
        title: ['A collection of routes for transit agency ', a, '.'].join('')
      }
    ]
  };
}

routes.list = function(req, res) {
  var path = [NBXML_FEED, '?command=routeList&a=', req.params.agency].join(''),
      params = req.params;

  http.get(utils.getOptionsWithPath(path), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = [],
          nberr, rte, uri;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0];
        uri = utils.getOpenPath(req);
        if(!nberr) {
          /**
           * I can't assume that there is a <route> element in the XML. For some reason NextBus
           * allows an empty <body> response for some agencies, like 'calu-pa'. Doh!!
           */
          rte = js.body.route;
          if(rte) {
            js.body.route.forEach(function(route) {
              var $ = route.$,
                suri = [uri, '/', $.tag].join(''),
                previous = uri.replace('/routes', ''),
                r = {
                  id: $.tag,
                  title: $.title
                };

              r._links = {
                self: {
                  href: suri,
                  type: utils.c.MTJSON,
                  rel: 'http://restbus.info/_links/rel/full',
                  rt: C.RTE,
                  title: ['Full configuration for ', params.agency, ' route ', r.title , '.'].join('')
                },
                to: [
                  {
                    href: suri,
                    type: utils.c.MTJSON,
                    rel: 'http://restbus.info/_links/rel/full',
                    rt: C.RTE,
                    title: ['Full configuration for ', params.agency, ' route ', r.title , '.'].join('')
                  }
                ],
                from: [
                  {
                    href: previous,
                    type: utils.c.MTJSON,
                    rel: 'via',
                    rt: C.AGY,
                    title: ['Transit agency ', params.agency, ' details.'].join('')
                  },
                  {
                    href: uri,
                    type: utils.c.MTJSON,
                    rel: 'section',
                    rt: C.RTE,
                    title: ['A collection of routes for transit agency ', params.agency, '.'].join('')
                  }
                ]
              };
              json.push(r);
            });
          }
          res.status(200).json(json);
        } else utils.nbXmlError(nberr, res);
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

routes.get = function(req, res) {
  var p = req.params,
      path = [NBXML_FEED, '?command=routeConfig&a=', p.agency, '&r=', p.route].join('');

  http.get(utils.getOptionsWithPath(path), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = {},
          route, $, nberr, uri, vuri, ruri;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0];
        uri = utils.getOpenPath(req);
        vuri = [uri, '/', 'vehicles'].join('');
        if(!nberr) {
          route = js.body.route[0];
          $ = route.$;
          ruri = uri.replace('/' + $.tag, '');

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
            var $ = stop.$,
                lat = parseFloat($.lat),
                lon = parseFloat($.lon),
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

          json._links = getLinks({self: uri, vehicle: vuri, stops: json.stops, route: ruri}, json, req);
          res.status(200).json(json);
        } else utils.nbXmlError(nberr, res);
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

module.exports = routes;
