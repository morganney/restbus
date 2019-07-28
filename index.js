var restbus = require('./lib/restbus');

if (process.argv[2] === 'run') {
  restbus.listen();
}

module.exports = restbus;
