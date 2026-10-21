// Used only by react-native-builder-bob: its default preset plus legacy decorators (the src uses them).
module.exports = {
  presets: [require.resolve('react-native-builder-bob/babel-preset')],
  plugins: [['@babel/plugin-proposal-decorators', { legacy: true }]],
}
