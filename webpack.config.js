const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const nodeExternals = require('webpack-node-externals');

module.exports = [
  {
    entry: './frontend/index.tsx',
    target: 'web',
    devtool: 'source-map',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            'css-loader',
          ]
        },
      ],
    },
    resolve: {
      extensions: [ '.tsx', '.ts', '.js' ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'frontend/index.html'),
        hash: true
      })
    ],
    output: {
      filename: 'frontend.js',
      path: path.resolve(__dirname, 'dist'),
    },
  },
  {
    entry: './backend/index.ts',
    target: 'node',
    devtool: 'source-map',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: [ '.tsx', '.ts', '.js' ],
    },
    externals: [nodeExternals()],
    output: {
      filename: 'backend.js',
      path: path.resolve(__dirname, 'dist'),
    },
  }
];
