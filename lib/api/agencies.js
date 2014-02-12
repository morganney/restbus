var http = require('http'),
    utils = require('../utils'),
    NBXML_FEED = utils.c.NEXTBUS_XMLFEED,
    agencies = {};

agencies.list = function(req, res) {
  http.get(utils.getOptionsWithPath(NBXML_FEED + '?command=agencyList'), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = [];

      if(!err) {
        js.body.agency.forEach(function(agency) {
          var $ = agency.$; // Agency data stored as XML attributes.

          json.push({ id: $.tag, title: $.title, region: $.regionTitle });
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
      var json = false;

      if(!err) {
        js.body.agency.every(function(agency) {
          var $ = agency.$;

          if($.tag == agency_id) {
            json = { id: $.tag, title: $.title, region: $.regionTitle };
          } else return true; // Keep looping.
        });
        if(json) res.json(200, json);
        else res.json(404, utils.errors.get(404, 'Agency id not found: ' + agency_id));
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

module.exports = agencies;