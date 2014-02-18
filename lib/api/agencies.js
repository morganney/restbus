var http = require('http'),
    utils = require('../utils'),
    NBXML_FEED = utils.c.NEXTBUS_XMLFEED,
    agencies = {};

function getJson($) {
  var agency = {
      id: $.tag,
      title: $.title,
      region: $.regionTitle
    };

  return agency;
}

function getLinks(hrefs) {
  return {
    self: {
      method: 'GET',
      href: hrefs.self,
      transition: 'Current representation for transit agency resource.',
      resource: 'agency',
      type: 'unit'
    },
    to: [
      {
        method: 'GET',
        href: hrefs.route,
        transition: 'Collection of route resources for transit agency.',
        resource: 'route',
        type: 'collection'
      },
      {
        method: 'GET',
        href: hrefs.vehicle,
        transition: 'Collection of vehicle resources for transit agency.',
        resource: 'vehicle',
        type: 'collection'
      }
    ],
    from: [
      {
        method: 'GET',
        href: hrefs.agency,
        transition: 'Collection of transit agency resources. This is the API root.',
        resource: 'agency',
        type: 'collection'
      }
    ]
  };
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

          a._links = getLinks({self: hrefself, route: ruri, vehicle: vuri, agency: uri});
          json.push(a);
        });
        res.json(200, json);
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
            json._links = getLinks({self: uri, route: ruri, vehicle: vuri, agency: auri})
          } else return true; // Keep looping.
        });
        if(json) res.json(200, json);
        else res.json(404, utils.errors.get(404, 'Agency id not found: ' + agency_id));
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

module.exports = agencies;