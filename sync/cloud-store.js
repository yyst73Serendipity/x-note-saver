/**
 * Firestore 边界：带回执的幂等事务以及按服务端时间分页读取的增量快照。
 */
import { collection, doc, runTransaction, serverTimestamp, query, orderBy, documentId, startAt, startAfter, limit, getDocsFromServer, Timestamp } from 'firebase/firestore';
import { mergeOperation } from '../storage/model.js';

/** 网络超时不撤销可能已提交的事务；持久回执保证下一次重试安全。 */
async function deadline(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('网络请求超时'), { code: 'deadline-exceeded' })), 20000); })]);
  } finally { clearTimeout(timer); }
}
function plainRecord(value) {
  const { updatedAt, ...record } = value;
  return { ...record, ...(updatedAt ? { updatedAt: { seconds: updatedAt.seconds, nanoseconds: updatedAt.nanoseconds } } : {}) };
}
export class CloudStore {
  constructor(db) { this.db = db; }
  /** 回执与记录在同一事务提交，防止请求成功但本地尚未确认时重复覆盖。 */
  async commit(uid, operation) {
    const recordRef = doc(this.db, 'users', uid, operation.collection, operation.recordId);
    const receiptRef = doc(this.db, 'users', uid, 'operations', operation.id);
    return deadline(runTransaction(this.db, async transaction => {
      const receipt = await transaction.get(receiptRef);
      const snapshot = await transaction.get(recordRef);
      const previous = snapshot.exists() ? plainRecord(snapshot.data()) : undefined;
      if (receipt.exists()) {
        if (receipt.data().collection !== operation.collection || receipt.data().recordId !== operation.recordId) throw new Error('同步回执不匹配');
        return previous;
      }
      const merged = mergeOperation(previous, operation);
      if (!previous || merged.revision !== previous.revision) transaction.set(recordRef, { ...merged, updatedAt: serverTimestamp() });
      transaction.set(receiptRef, { collection: operation.collection, recordId: operation.recordId, createdAt: serverTimestamp() });
      // 响应中的时间戳不参与游标推进，游标只由后续真实服务端查询生成。
      return merged;
    }));
  }
  /** 边界时间包含重读，页内使用时间加文档 ID，避免同一时间戳遗漏记录。 */
  async *pull(uid, kind, cursor, pageSize = 200) {
    let after;
    while (true) {
      const constraints = [orderBy('updatedAt'), orderBy(documentId())];
      if (after) constraints.push(startAfter(after.time, after.id));
      else if (cursor) constraints.push(startAt(new Timestamp(cursor.seconds, cursor.nanoseconds)));
      constraints.push(limit(pageSize));
      const snapshot = await deadline(getDocsFromServer(query(collection(this.db, 'users', uid, kind), ...constraints)));
      if (snapshot.empty) return;
      const last = snapshot.docs.at(-1);
      const time = last.data().updatedAt;
      yield { records: snapshot.docs.map(item => ({ id: item.id, record: plainRecord(item.data()) })), cursor: { seconds: time.seconds, nanoseconds: time.nanoseconds } };
      if (snapshot.size < pageSize) return;
      after = { time, id: last.id };
    }
  }
}
