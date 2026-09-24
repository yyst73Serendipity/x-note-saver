/**
 * 校验认证 iframe 的来源和请求编号，仅转发本次 Google 登录结果。
 */
import { config } from '../config/firebase-config.js';
import { isAuthResponse } from '../auth/auth-guard.js';
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== 'auth-offscreen' || sender.id !== chrome.runtime.id) return false;
  const origin = new URL(config.authPageUrl).origin;
  const iframe = document.createElement('iframe');
  iframe.src = config.authPageUrl;
  let finished = false;
  const finish = result => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearInterval(heartbeat);
    window.removeEventListener('message', receive);
    iframe.remove();
    respond(result);
  };
  const receive = event => {
    if (!isAuthResponse(event, iframe.contentWindow, origin, message.requestId)) return;
    finish(event.data);
  };
  const heartbeat = setInterval(() => chrome.runtime.sendMessage({ target: 'auth-heartbeat' }).catch(() => {}), 15000);
  const timer = setTimeout(() => finish({ ok: false, error: '登录超时，请重新打开登录窗口' }), 120000);
  window.addEventListener('message', receive);
  iframe.addEventListener('load', () => iframe.contentWindow.postMessage({ type: 'x-note-auth-start', requestId: message.requestId }, origin), { once: true });
  iframe.addEventListener('error', () => finish({ ok: false, error: '无法加载登录页面，请检查网络与 Hosting 配置' }), { once: true });
  document.body.append(iframe);
  return true;
});
