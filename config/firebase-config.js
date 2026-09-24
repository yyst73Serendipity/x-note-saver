/**
 * 构建时注入公开 Firebase 客户端配置，未配置时保持纯本地模式。
 */
export const config = typeof __FIREBASE_CONFIG__ === 'undefined' ? {} : __FIREBASE_CONFIG__;
export const extensionId = typeof __EXTENSION_ID__ === 'undefined' ? '' : __EXTENSION_ID__;
