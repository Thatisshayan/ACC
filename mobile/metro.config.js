const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const config = getDefaultConfig(__dirname);
const nestedAppPath = path.resolve(__dirname, 'my-app');

config.resolver.blockList = [
  new RegExp(`${escapeRegExp(nestedAppPath)}[/\\\\].*`),
];

module.exports = config;
