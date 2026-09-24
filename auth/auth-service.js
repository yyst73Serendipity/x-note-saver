/**
 * 在受控隐藏文档中完成 Google 授权，将凭据交给扩展专用 Firebase Auth。
 */
import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth/web-extension';
import { firebaseClient } from './firebase-client.js';
import { config } from '../config/firebase-config.js';
let signingIn;

/** 同时只允许一个登录窗口，完成后销毁认证桥。 */
export function login() {
  if (signingIn) return signingIn;
  signingIn = (async () => {
    const client = firebaseClient();
    if (!client) throw new Error('请先配置 Firebase，当前仍可使用本地收藏');
    if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
    await chrome.offscreen.createDocument({ url: 'offscreen/offscreen.html', reasons: ['IFRAME_SCRIPTING'], justification: '通过托管页面完成用户主动请求的 Google 登录' });
    try {
      const result = await chrome.runtime.sendMessage({ target: 'auth-offscreen', requestId: crypto.randomUUID() });
      if (!result?.ok) throw Object.assign(new Error(result?.error || '登录失败'), { code: result?.code });
      const signed = await signInWithCredential(client.auth, GoogleAuthProvider.credential(result.idToken));
      if (config.ownerUid && signed.user.uid !== config.ownerUid) {
        await signOut(client.auth);
        throw new Error('此扩展仅允许配置的个人账号登录');
      }
      return signed.user;
    } finally {
      if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
    }
  })().finally(() => { signingIn = null; });
  return signingIn;
}
export async function logout() {
  const client = firebaseClient();
  if (client) await signOut(client.auth);
}
