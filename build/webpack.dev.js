const webpack = require('webpack');
const VueLoaderPlugin = require('vue-loader/lib/plugin');
const path = require('path');

module.exports = {
    entry: path.resolve(__dirname, '../src/main.js'),
    output: {
        filename: 'doc-bundle.js',
        path: path.resolve(__dirname, '../public/js'),
        library: 'echartsDoc',
        libraryTarget: 'umd'
    },
    module: {
        rules: [{
            test: /\.vue$/,
            use: ['vue-loader']
        }, {
            test: /\.js$/,
            use: ['babel-loader'],
            exclude: /node_modules/
        }, {
            test: /\.css$/,
            use: ['style-loader', 'css-loader']
        }, {
            test: /\.scss$/,
            use: ['style-loader', 'css-loader', 'sassjs-loader']
        }, {
            test: /\.(png|jpg|jpeg|gif|eot|ttf|woff|woff2|svg|svgz)(\?.+)?$/,
            use: [{
                loader: 'url-loader',
                options: {
                    limit: 10000,
                    publicPath: '../asset',
                    name: '../asset/[name].[ext]'
                }
            }]
        }]
    },
    plugins: [
        new webpack.IgnorePlugin(/^fs$/),
        new VueLoaderPlugin()
    ],
    devServer: {
        compress: true,
        contentBase: path.resolve(__dirname, '../public'),
        openPage: 'zh/option.html',
        writeToDisk: true
    }
};
