var http = require('http');
var utils = require('../utils');
var C = utils.c;
var NBXML_FEED = C.NEXTBUS_XMLFEED;
var last_time = 0;
var vehicles = {};

function getJson(vehicle) {
  var v = {},
    $ = vehicle.$;

  v.id = $.id;
  v.routeId = !$.routeTag ? null : $.routeTag;
  v.directionId = !$.dirTag ? null : $.dirTag;
  v.predictable = !!($.predictable === 'true');
  v.secsSinceReport = parseInt($.secsSinceReport, 10);
  v.kph = !$.speedKmHr ? null : parseInt($.speedKmHr, 10);
  v.heading = parseInt($.heading, 10);
  v.lat = parseFloat($.lat);
  v.lon = parseFloat($.lon);
  v.leadingVehicleId = !$.leadingVehicleId ? null : $.leadingVehicleId;

  return v;
}

function getLinks(hrefs, v, req) {
  var params = req.params,
      r = v.routeId || params.route, // To protect against XML feed inconsistencies when vehicles log off route
      a = params.agency,
      s = {
        href: hrefs.self,
        type: C.MTJSON,
        rel: 'self',
        rt: C.VEH,
        title: ['Transit agency ', a, ' vehicle ', v.id, '.'].join('')
      },
      rsection = {
        href: hrefs.route,
        type: C.MTJSON,
        rel: 'section',
        rt: C.VEH,
        title: ['A collection of vehicles currently on route ', r, ' for agency ', a, '.'].join('')
      },
      asection = {
        href: hrefs.agency,
        type: C.MTJSON,
        rel: 'section',
        rt: C.VEH,
        title: ['A collection of vehicles for agency ', a, '.'].join('')
      },
      avia = {
        href: hrefs.agency.replace('/vehicles', ''),
        type: C.MTJSON,
        rel: 'via',
        rt: C.AGY,
        title: ['Transit agency ', a, ' details.'].join('')
      },
      to = [],
      from = [];

  if(params.vehicle) {
    // Canonical vehicle resource (self) requested (/agencies/:a/vehicles/:v)
    from = from.concat([asection, rsection]);
  } else if(params.route) {
    // /agencies/:a/routes/:r/vehicles
    from = from.concat([asection, rsection]);
  } else {
    to.push(s);
    from = from.concat([asection, rsection, avia]);
  }

  return { self: s, to: to, from: from };
}

/**
 * Method for retrieving ALL vehicles for an agency. Interestingly, if you inclue the 'r=' query
 * parameter in the request to NextBus, but leave it without a value, then all agency vehicles are
 * returned as desired. However, including it allows us to reuse this method for vehicles.routelist.
 *
 * @param {Object:req} The node native http.ClientRequest object.
 * @param {Object:res} The node native http.ServerResponse object.
 */
vehicles.list = function(req, res) {
  var p = req.params,
      a = p.agency,
      r = p.route ? p.route : '',
      path = [NBXML_FEED, '?command=vehicleLocations&a=', a, '&r=', r, '&t=0'].join('');

  http.get(utils.getOptionsWithPath(path), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = [], nberr, vehicles, uri, ruri;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0];
        uri = utils.getOpenPath(req);
        // Adjust uri for building links if list() is invoked from routelist()
        if(r) uri = uri.replace(/routes\/.*\/vehicles/gi,'vehicles');
        ruri = uri.replace('/vehicles', '/routes'); // will mess up vehicles.routelist()
        if(!nberr) {
          /**
           * NextBus returns only a <lastTime> element when a bogus route id is used in the request.
           * They DO NOT return an <Error> element. For now I will immitate their response and
           * return an empty array of vehicles instead of an HTTP 404 response.
           */
          vehicles = js.body.vehicle;
          if(vehicles) vehicles.forEach(function(vehicle) {
            var v = getJson(vehicle),
                href, rhref;

            href = [uri, '/', v.id].join('');
            rhref = [ruri, '/', v.routeId, '/vehicles'].join('');
            v._links = getLinks({self: href, agency: uri, route: rhref}, v, req);
            json.push(v);
          });
          last_time = parseInt(js.body.lastTime[0].$.time, 10);
          res.status(200).json(json);
        } else utils.nbXmlError(nberr, res);
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

vehicles.routelist = function(req, res) { vehicles.list(req, res); };

vehicles.get = function(req, res) {
  var p = req.params,
      a = p.agency,
      v = p.vehicle,
      path = [NBXML_FEED, '?command=vehicleLocation&a=', a, '&v=', v].join('');

  http.get(utils.getOptionsWithPath(path), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var nberr, uri, auri, ruri;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0];
        if(!nberr) {
          var v = getJson(js.body.vehicle[0]), // NextBus doesn't use <lastTime> element for this command
              uri = utils.getOpenPath(req),
              auri = uri.replace('/' + v.id, ''),
              rstr = ['/routes/', v.routeId, '/vehicles'].join(''),
              ruri = auri.replace('/vehicles', rstr);

          v._links = getLinks({self: uri, agency: auri, route: ruri}, v, req);

          res.status(200).json(v);
        } else utils.nbXmlError(nberr, res);
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

module.exports = vehicles;
