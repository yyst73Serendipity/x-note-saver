/**
 * 校验云配置及认证桥消息，拒绝其他页面伪造的登录响应。
 */
export function isConfigured(config) {
  return ['apiKey', 'authDomain', 'projectId', 'appId', 'authPageUrl'].every(key => typeof config[key] === 'string' && config[key].length > 0) && /^https:\/\//.test(config.authPageUrl);
}
export function isAuthResponse(event, source, origin, requestId) {
  return event.source === source && event.origin === origin && event.data?.type === 'x-note-auth-result' && event.data.requestId === requestId;
}
/** 将技术错误映射为可执行的中文提示，不记录认证令牌。 */
export function friendlyError(error) {
  const code = error?.code || '';
  if (/permission-denied/.test(code)) return '数据库权限未配置或当前账号无权访问，请检查所有者 UID 和安全规则';
  if (/resource-exhausted/.test(code)) return '云端额度已用尽，本地修改已保留，请稍后重试';
  if (/unauthenticated|user-token-expired|invalid-user-token/.test(code)) return '登录已失效，请重新登录；本地修改已保留';
  if (/popup-closed|cancelled-popup/.test(code)) return '登录窗口已关闭，请重试';
  if (/unauthorized-domain/.test(code)) return '登录域名尚未授权，请按配置文档添加扩展 ID 和 Hosting 域名';
  if (/popup-blocked/.test(code)) return '登录弹窗被浏览器拦截，请允许弹窗后重试';
  if (/network|unavailable|deadline/.test(code)) return '网络暂时不可用，本地修改已保留，联网后会重试';
  return error?.message || '操作失败，请稍后重试';
}
