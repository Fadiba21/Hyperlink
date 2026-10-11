const TdLib = {
  startTdLib: jest.fn(async () => 'authorizationStateWaitPhoneNumber'),
  getAuthorizationState: jest.fn(async () => 'authorizationStateWaitPhoneNumber'),
  login: jest.fn(async () => 'ok'),
  verifyPhoneNumber: jest.fn(async () => 'ok'),
  verifyPassword: jest.fn(async () => 'ok'),
  loadChats: jest.fn(async () => 'ok'),
  getChats: jest.fn(async () => '[]'),
  logout: jest.fn(async () => 'ok'),
};
export default TdLib;
