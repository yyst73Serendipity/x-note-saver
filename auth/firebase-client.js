/**
 * 初始化扩展专用 Firebase 客户端，认证会话保存在扩展自身 IndexedDB。
 */
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence } from 'firebase/auth/web-extension';
import { initializeFirestore } from 'firebase/firestore/lite';
import { config } from '../config/firebase-config.js';
import { isConfigured } from './auth-guard.js';
let client;
export function firebaseClient() {
  if (!isConfigured(config)) return null;
  if (!client) {
    const app = initializeApp(config);
    // Firestore Lite 直接使用 Fetch，适配不提供 XMLHttpRequest 的 Manifest V3 Service Worker。
    const db = initializeFirestore(app, {});
    client = {
      auth: initializeAuth(app, { persistence: indexedDBLocalPersistence }),
      db
    };
  }
  return client;
}
