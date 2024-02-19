/**
 * Used by morganney.github.io/restbus.info domain for hosting documentation about restbus.
 */
const serverlessExpress = require('@codegenie/serverless-express');
const restbus = require('./lib/restbus');

exports.handler = serverlessExpress({ app: restbus.app() });
