/**
 * 托管环境中的 Google 登录入口，只向固定扩展来源返回短期凭据。
 */
import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { config, extensionId } from '../config/firebase-config.js';
const auth = initializeAuth(initializeApp(config), { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
const allowedOrigin = `chrome-extension://${extensionId}`;
let busy = false;
window.addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== allowedOrigin || event.data?.type !== 'x-note-auth-start' || typeof event.data.requestId !== 'string' || busy) return;
  busy = true;
  const reply = data => parent.postMessage({ ...data, type: 'x-note-auth-result', requestId: event.data.requestId }, allowedOrigin);
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.idToken) throw new Error('Google 未返回有效的登录凭据');
    reply({ ok: true, idToken: credential.idToken });
  } catch (error) {
    reply({ ok: false, error: 'Google 登录失败，请重新尝试', code: error.code || '' });
  } finally {
    await signOut(auth).catch(() => {});
    busy = false;
  }
});
