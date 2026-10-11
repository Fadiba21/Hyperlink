module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^react-native-tdlib$': '<rootDir>/__mocks__/react-native-tdlib.ts',
    '^react-native-keychain$': '<rootDir>/__mocks__/react-native-keychain.ts',
  },
};
