// babel.config.js
module.exports = {
  // `presets` define which Babel presets to use (e.g., for React Native syntax)
  presets: ['module:@react-native/babel-preset'],
  // `plugins` define specific Babel plugins to apply
  plugins: [
    // The Reanimated plugin MUST be listed LAST in the plugins array.
    // This is a requirement for react-native-reanimated to function correctly.
    'react-native-reanimated/plugin',
  ],
};
