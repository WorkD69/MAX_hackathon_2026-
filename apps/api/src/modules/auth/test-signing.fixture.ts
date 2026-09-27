// Test-runner only. Never import this module from an HTTP route or a browser entry point.
import { createHmac } from 'node:crypto';

export function signSyntheticMaxInitData(input: {
  profile: 'TEST_DEMO_E2E_V1';
  signingKey: Buffer;
  nowSeconds: number;
  userId: string;
  chatId: string;
  chatType?: 'DIALOG' | 'CHAT' | 'CHANNEL';
}): string {
  if (input.profile !== 'TEST_DEMO_E2E_V1' || input.signingKey.length !== 32 ||
    !Number.isSafeInteger(input.nowSeconds) ||
    !/^[1-9][0-9]*$/.test(input.userId) || !/^[1-9][0-9]*$/.test(input.chatId)) {
    throw new Error('INVALID_TEST_LAUNCH_INPUT');
  }
  const fields = {
    auth_date: String(input.nowSeconds),
    user: `{"id":${input.userId},"first_name":"Test","last_name":"User"}`,
    chat: `{"id":${input.chatId},"type":"${input.chatType ?? 'DIALOG'}"}`,
  };
  const canonical = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const hash = createHmac('sha256', input.signingKey).update(canonical, 'utf8').digest('hex');
  return Object.entries(fields).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&') + `&hash=${hash}`;
}
