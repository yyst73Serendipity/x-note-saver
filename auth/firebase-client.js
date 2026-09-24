/**
 * 初始化扩展专用 Firebase 客户端，认证会话保存在扩展自身 IndexedDB。
 */
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence } from 'firebase/auth/web-extension';
import { initializeFirestore } from 'firebase/firestore';
import { config } from '../config/firebase-config.js';
import { isConfigured } from './auth-guard.js';
let client;
export function firebaseClient() {
  if (!isConfigured(config)) return null;
  if (!client) {
    const app = initializeApp(config);
    client = { auth: initializeAuth(app, { persistence: indexedDBLocalPersistence }), db: initializeFirestore(app, { experimentalAutoDetectLongPolling: true }) };
  }
  return client;
}
