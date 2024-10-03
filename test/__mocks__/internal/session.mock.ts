import { AuthUser, SessionData } from '@/module/types';

const DEFAULT_SESSION = {
  uid: 'Fef8GnS7C5zN:rHg5Gd5VGMdv',
  appPid: 'Fef8GnS7C5zN',
  keyId: 'GFVHaIrJ6Y1_',
  clientId: 'Fef8GnS7C5zN:rHg5Gd5VGMdv',
  exp: 1726824883,
  timestamp: '2024-09-20T09:29:43.717Z',
  permissions: {
    'chat:*': ['subscribe', 'publish', 'presence', 'metrics', 'history']
  },
  user: {
    id: 'b9bc871d-33b0-47c9-8d86-4085b37cfb05',
    clientId: 'rHg5Gd5VGMdv',
    createdAt: '2024-09-16T14:06:35.477Z',
    updatedAt: '2024-09-16T14:06:35.477Z',
    username: 'court-orderedscouring312',
    orgId: '6a52666d-79a5-4e08-bfe7-70d6d0756400',
    appId: '43c7315e-c680-4279-87f9-256e9e3fc2ec',
    isOnline: true,
    lastOnline: '2024-09-20T09:29:42.455Z',
    blockedAt: null
  },
  connectionId: 'Fef8GnS7C5zN:U7JWOF-5XgfF',
  socketId: '63836bc5-e304-415a-a93e-230fe5f32c64'
};

export function getMockSession(
  session: Partial<SessionData> = {},
  user: Partial<AuthUser> = {}
): SessionData {
  return {
    ...DEFAULT_SESSION,
    ...session,
    user: {
      ...DEFAULT_SESSION.user,
      ...user
    }
  };
}
