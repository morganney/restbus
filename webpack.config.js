var path = require('path');

module.exports = {
  entry: './lambda.js',
  target: 'node',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: 'index.js',
    library: {
      type: 'commonjs2'
    }
  },
  /**
   * @see https://github.com/webpack/webpack/issues/1576
   */
  ignoreWarnings: [
    {
      module: /node_modules\/express\/lib\/view\.js/,
      message: /the request of a dependency is an expression/
    }
  ]
};
