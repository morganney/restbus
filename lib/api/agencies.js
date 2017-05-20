var http = require('http');
var utils = require('../utils');
var NBXML_FEED = utils.c.NEXTBUS_XMLFEED;
var agencies = {};

function getJson($) {
  var agency = {
      id: $.tag,
      title: $.title,
      region: $.regionTitle
    };

  return agency;
}

function getLinks(hrefs, agency, req) {
  var params = req.params,
      s = {
        href: hrefs.self,
        type: utils.c.MTJSON,
        rel: 'self',
        rt: utils.c.AGY,
        title: "Transit agency '" + agency.id + "'."
      },
      r = {
        href: hrefs.route,
        type: utils.c.MTJSON,
        rel: 'describedby',
        rt: utils.c.RTE,
        title: "A collection of routes for transit agency '" + agency.id + "'."
      },
      v = {
        href: hrefs.vehicle,
        type: utils.c.MTJSON,
        rel: 'describedby',
        rt: utils.c.VEH,
        title: "A collection of vehicles for transit agency '" + agency.id + "'."
      },
      a = {
        href: hrefs.agency,
        type: utils.c.MTJSON,
        rel: 'bookmark',
        rt: utils.c.AGY,
        title: 'A collection of transit agencies. This is the API root!'
      },
      to = [],
      from = [];

  if(params.agency) {
    to = to.concat([r, v]);
    from.push(a);
  } else {
    to.push(s);
    from.push(a);
  }

  return { self: s, to: to, from: from };
}

agencies.list = function(req, res) {
  http.get(utils.getOptionsWithPath(NBXML_FEED + '?command=agencyList'), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = [],
          uri;

      if(!err) {
        uri = utils.getOpenPath(req);

        js.body.agency.forEach(function(agency) {
          var $ = agency.$,
              a = getJson($),
              hrefself = [uri, '/', a.id].join(''),
              vuri = [hrefself, '/', 'vehicles'].join(''),
              ruri = [hrefself, '/', 'routes'].join('');

          a._links = getLinks({self: hrefself, route: ruri, vehicle: vuri, agency: uri}, a, req);
          json.push(a);
        });
        res.status(200).json(json);
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

agencies.get = function(req, res) {
  var agency_id = req.params.agency;

  http.get(utils.getOptionsWithPath(NBXML_FEED + '?command=agencyList'), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = false,
          uri, ruri, vuri, auri;

      if(!err) {
        uri = utils.getOpenPath(req);
        js.body.agency.every(function(agency) {
          var $ = agency.$;

          if($.tag == agency_id) {
            json = getJson($);
            ruri = uri + '/routes';
            vuri = uri + '/vehicles';
            auri = uri.replace('/' + json.id, '');
            json._links = getLinks({self: uri, route: ruri, vehicle: vuri, agency: auri}, json, req);
          } else return true; // Keep looping.
        });
        if(json) res.status(200).json(json);
        else res.status(404).json(utils.errors.get(404, 'Agency id not found: ' + agency_id));
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

module.exports = agencies;
