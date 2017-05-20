var http = require('http');
var zlib = require('zlib');
var qs = require('querystring');
var utils = require('../utils');
var C = utils.c;
var NBXML_FEED = C.NEXTBUS_XMLFEED;
var predictions = {};

predictions.get = function(req, res) {
  var params = req.params,
      a = params.agency,
      r = params.route,
      s = params.stop,
      onsplit = params.onsplit || 'routes',
      path = params.path || [NBXML_FEED, '?command=predictions&a=', a, '&r=', r, '&s=', s].join('');

  http.get(utils.getOptionsWithPath(path), function(nbres) {
    utils.getJsFromXml(nbres, function(err, js) {
      var json = [], nberr, url, uri;

      if(!err) {
        nberr = js.body.Error && js.body.Error[0];
        url = utils.getOpenPath(req);
        uri = url.split(onsplit)[0]; // Note 'uri' is closed in this case.
        if(!nberr) {
          // Predictions for each route (if they exist).
          js.body.predictions.forEach(function(pred) {
            var $ = pred.$,
                messages = pred.message,
                p = {},
                selflink = {},
                from = [],
                title = '';

            if(typeof $.dirTitleBecauseNoPredictions === 'undefined') {
              p.agency = {
                id: a,
                title: $.agencyTitle,
                logoUrl: null
              };
              p.route = {
                id: $.routeTag,
                title: $.routeTitle
              };
              p.stop = {
                id: $.stopTag,
                title: $.stopTitle,
                distance: null
              };
              p.messages = [];
              if(messages) messages.forEach(function(m) {
                p.messages.push({ text: m.$.text, priority: m.$.priority });
              });

              p.values = [];
              // Prediction values for each route direction
              pred.direction.forEach(function(direction) {
                direction.prediction.forEach(function(prediction) {
                  var $$ = prediction.$,
                      v = {};

                  v.epochTime = parseInt($$.epochTime, 10);
                  v.seconds = parseInt($$.seconds, 10);
                  v.minutes = parseInt($$.minutes, 10);
                  v.branch = !$$.branch ? null : $$.branch;
                  v.isDeparture = !!($$.isDeparture === 'true');
                  v.affectedByLayover = !$$.affectedByLayover ? false : true;
                  v.isScheduleBased = !$$.isScheduleBased ? false : true;
                  v.vehicle = {
                    id: $$.vehicle,
                    block: $$.block,
                    trip: !$$.tripTag ? null : $$.tripTag
                  };
                  v.direction = {
                    id: $$.dirTag,
                    title: direction.$.title
                  };

                  p.values.push(v);
                });
              });

              // Sort the prediction values in ascending order
              p.values.sort(function(a, b) {return a.epochTime - b.epochTime;});

              // Find which title to use for hypertext links
              switch(onsplit) {
                case 'routes':
                  title = ['Predictions for stop ', p.stop.title, ' on ', p.agency.id, ' route ', p.route.id, '.'].join('');
                  break;
                case 'stops':
                  title = ['Predictions for agency ', p.agency.id, ' stop code ', params.code, '.'].join('');
                  break;
                case  'tuples':
                  title = ['Predictions for agency ', p.agency.id, ' tuples ', params.tuples, '.'].join('');
                  break;
              }

              // Create the self-link
              selflink = {
                href: [uri, 'routes/', p.route.id, '/stops/', p.stop.id, '/predictions'].join(''),
                type: C.MTJSON,
                rel: 'self',
                rt: C.PRED,
                title: title
              };

              // Push the from-link related to the prediction collection (all predictions are collections)
              from.push({
                href: url,
                type: C.MTJSON,
                rel: 'section',
                rt: C.PRED,
                title: title
              });

              // Add a via from-links if needed (tuples and code preds are only known by docs at restbus.info)
              if(onsplit === 'routes') {
                from.push({
                  href: [uri, 'routes/', p.route.id].join(''),
                  type: C.MTJSON,
                  rel: 'via',
                  rt: C.RTE,
                  title: ['Full route configuration for ', p.agency.id, ' route ', p.route.id, '.'].join('')
                });
              }

              // Build the prediction hypertext links
              p._links = { self: selflink, to: [], from: from };

              json.push(p);
            } // else there are no predictions thus json === [empty].
          });

          res.status(200).json(json);
        } else utils.nbXmlError(nberr, res);
      } else utils.streamOrParseError(err, js, res);
    });
  }).on('error', function(e) { utils.nbRequestError(e, res); });
};

/**
 * Method for returning predictions for every route passing through a stop. Uses the stopId (code) property
 * for a stop from the NextBus XML feed. Wrapper of predictions.get() but doesn't require a route id.
 *
 * I don't believe there is a function to find the stop.id from the stop.stopId for ALL agencies.
 * I'm going to let this slide and leave the _links.from array to empty. The API still uses HATEOAS.
 * Just reuse the implementation in predictions.get() as-is.
 *
 * @uri /agencies/:agency/stops/:code/predictions
 *
 * @param {Object:req} The node native http.ClientRequest object.
 * @param {Object:res} The node native http.ServerResponse object.
 */
predictions.list = function(req, res) {
  var p = req.params;

  p.onsplit = 'stops';
  p.path = [NBXML_FEED, '?command=predictions&a=', p.agency, '&stopId=', p.code].join('');
  predictions.get(req, res);
};

/**
 * Tuples <====> F:5650 (route-id:stop-id)
 * @uri /agencies/:agency/tuples/:tuples/predictions e.g. /agencies/sf-muni/tuples/F:5650,N:6997/predictions
 *
 * @param {Object:req} The node native http.ClientRequest object.
 * @param {Object:res} The node native http.ServerResponse object.
 */

predictions.tuples = function(req, res) {
  var p = req.params,
      tuples = p.tuples,
      q = '';


  tuples.split(',').forEach(function(tuple) {

    q += ['&', 'stops=', tuple.replace(':', '|')].join('');
  });
  p.path = [NBXML_FEED, '?command=predictionsForMultiStops&a=', p.agency, q].join('');
  p.onsplit = 'tuples';
  predictions.get(req, res);
};

/**
 * Method for predictions by geolocation. May have unreliable error reporting,
 * but always has reliable prediction data.
 *
 * UNSTABLE: The data from NextBus behind this request can be removed at any moment and
 * without notice. Use this particular method at your own risk.
 *
 * @param {Object:req} The node native http.ClientRequest object.
 * @param {Object:res} The node native http.ServerResponse object.
 */
predictions.location = function(req, res) {
  var p = req.params,
      latlon = p.latlon,
      alatlon = latlon.split(','),
      latlonrgx = /^([-+]?\d{1,2}([.]\d+)?),\s*([-+]?\d{1,3}([.]\d+)?)$/,
      layoverrgx = /sup/gi,
      busatstoprgx = /arriving|due|departing/gi,
      postdata, options, postreq;

  if(latlonrgx.test(latlon)) {
    postdata = qs.stringify({
      preds: 'byLoc',
      maxDis: '2300',
      accuracy: '2400',
      lat: alatlon[0].trim(),
      lon: alatlon[1].trim()
    });
    options = {
      hostname: 'www.nextbus.com',
      path: '/service/mobile',
      method: 'POST',
      port: 80,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': postdata.length
      }
    };
    postreq = http.request(options, function(nbres) {
      var nbjson = '';

      nbres.on('data', function(d) { if(d) nbjson += d; });

      nbres.on('end', function() {
        var json = [],
            parseErr = false,
            uri;

        try {
          nbjson = JSON.parse(nbjson);
        } catch(e) {
          parseErr = true;
        } finally {
          if(!parseErr) {
            uri = utils.getOpenPath(req);
            if(nbjson.preds) {
              nbjson.preds.forEach(function(pred) {
                var p = {},
                    pfs = pred.pred_for_stop,
                    ps = pred.pred_str.replace(/minutes|min|mins/g,'').trim(),
                    directionTitle = pred.route_dir,
                    aps;

                p.agency = {
                  id: pfs.a,
                  title: pred.agency_name,
                  logoUrl: pred.agency_logo
                };
                p.route = {
                  id: pfs.r,
                  title: pred.route_name
                };
                p.stop = {
                  id: pfs.s,
                  title: pred.stop_name,
                  distance: pred.stop_distance
                };
                p.messages = [];
                pred.agency_msgs.forEach(function(msg) {
                  p.messages.push({text: msg, priority: null});
                });
                p.values = [];
                aps = ps.split('&');
                aps.forEach(function(pstr) {
                  var v = {}, affected = false, mins = 0;

                  // Check if the prediction value is affected by a layover.
                  if(layoverrgx.test(pstr)) affected = true;

                  // Check if the prediction is not zero minutes, i.e. the bus is not at the stop.
                  if(!busatstoprgx.test(pstr)) {
                    mins = parseInt(pstr.replace("<SUP>*</SUP>", ''), 10);
                  }

                  v.epochTime = null;
                  v.seconds = isNaN(mins) ? -1 : mins * 60;
                  v.minutes = isNaN(mins) ? -1 : mins;
                  v.branch = null;
                  v.isDeparture = null;
                  v.affectedByLayover = affected;
                  v.isScheduleBased = null;
                  v.vehicle = null;
                  v.direction = {
                    id: null,
                    title: directionTitle
                  };

                  p.values.push(v);
                });

                // Should already be sorted by NextBus, but just in case sort the values.
                p.values.sort(function(a, b) {return a.minutes - b.minutes;});

                p._links = {
                  self: {
                    href: uri,
                    type: C.MTJSON,
                    rel: 'self',
                    rt: C.PRED,
                    title: ['Transit agency predictions for latitude/longitude: ', latlon].join('')
                  },
                  to: [],
                  from: []
                };

                json.push(p);
              });
            }
            res.status(200).json(json);
          } else res.status(500).json(utils.errors.get(500, 'Unable to parse JSON from ' + options.hostname + '.'));
        }
      });

      nbres.on('error', function(e) {
        res.status(500).json(utils.errors.get(500, 'Unable to fulfill request to ' + options.hostname + '. ' + e.message));
      });

    }).on('error', function(e) { utils.nbRequestError(e, res); });

    postreq.write(postdata);
    postreq.end();
  } else res.status(404).json(utils.errors.get(404, 'A valid lat,lon pair is required.'));
};

module.exports = predictions;
