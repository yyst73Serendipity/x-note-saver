/**
 * 合并分页云快照并保存游标，保留已确认的新版本和仍在排队的本地编辑。
 */
export function applyPage(workspace, collection, page) {
  for (const { id, record } of page.records) {
    const previous = workspace.remote[collection][id];
    if (!previous || record.revision >= previous.revision) workspace.remote[collection][id] = record;
  }
  if (page.cursor) workspace.cursors[collection] = page.cursor;
}
