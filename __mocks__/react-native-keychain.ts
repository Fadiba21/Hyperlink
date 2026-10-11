const store: Record<string, string> = {};
export const ACCESSIBLE = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' };
export const getGenericPassword = jest.fn(async (opts?: { service?: string }) => (store[opts?.service || ''] ? { username: 'u', password: store[opts?.service || ''] } : false));
export const setGenericPassword = jest.fn(async (_u: string, p: string, opts?: { service?: string }) => { store[opts?.service || ''] = p; return true; });
export const resetGenericPassword = jest.fn(async (opts?: { service?: string }) => { delete store[opts?.service || '']; return true; });
