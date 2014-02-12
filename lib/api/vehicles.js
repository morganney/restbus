var http = require('http'),
    utils = require('../utils'),
    NBXML_FEED = utils.c.NEXTBUS_XMLFEED,
    last_time = 0,
    vehicles = {};


function getJsonForVeh(vehicle) {
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
      var json = [], nberr, vehicles;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0];
        if(!nberr) {
          /**
           * NextBus returns only a <lastTime> element when a bogus route id is used in the request.
           * They DO NOT return an <Error> element. For now I will immitate their response and
           * return an empty array of vehicles instead of an HTTP 404 response.
           */
          vehicles = js.body.vehicle;
          if(vehicles) vehicles.forEach(function(vehicle) { json.push(getJsonForVeh(vehicle)); });
          last_time = parseInt(js.body.lastTime[0].$.time, 10);
          res.json(200, json);
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
      var nberr;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0];
        if(!nberr) {
          /**
           * NextBus doesn't use the <lastTime> element for this command,
           * so if there is no 'nberr' a <vehicle /> element exists.
           */
          res.json(200, getJsonForVeh(js.body.vehicle[0]));
        } else utils.nbXmlError(nberr, res);
      } else utils.streamOrParseError(e, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

module.exports = vehicles;