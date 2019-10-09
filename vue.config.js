const Visualizer = require('webpack-visualizer-plugin');
// const webpack = require('webpack');
// const path = require('path');

module.exports = {
  configureWebpack: {
    plugins: [
      new Visualizer({ filename: './statistics.html' }),
    ],
  },
  chainWebpack: (config) => {
    config.plugins.delete('prefetch');
  },
};
