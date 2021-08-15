const {resolve} = require('path');

module.exports = {
  context: __dirname,
  devtool: 'cheap-module-source-map',
  entry: {
    background: './background/main',
    devtools: './devtools/main',
    panel: './panel/main',
  },
  output: {
    path: resolve(__dirname, '../build/audion'),
  },
};
