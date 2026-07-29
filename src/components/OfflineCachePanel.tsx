import {
  Database,
  HardDrive,
  Image,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { OfflineStats } from "../lib/offline";
import { Modal } from "./Modal";

interface OfflineCachePanelProps {
  loadStats: () => Promise<OfflineStats>;
  onSync: () => Promise<void>;
  onClear: () => Promise<void>;
  onClose: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OfflineCachePanel({
  loadStats,
  onSync,
  onClear,
  onClose,
}: OfflineCachePanelProps) {
  const [stats, setStats] = useState<OfflineStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStats(await loadStats());
    } catch {
      setError("キャッシュ情報を取得できませんでした。");
    }
  }, [loadStats]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "操作を完了できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal title="オフライン・キャッシュ管理" onClose={onClose}>
        <div className="offline-cache-panel">
          <p>
            保存したアルバムは、通信がないときも端末から閲覧できます。
          </p>
          <dl>
            <div>
              <dt><HardDrive size={16} /> 使用容量</dt>
              <dd>{stats ? formatBytes(stats.cacheBytes) : "確認中…"}</dd>
            </div>
            <div>
              <dt><Image size={16} /> 保存済み写真</dt>
              <dd>{stats?.savedPhotos ?? 0}枚</dd>
            </div>
            <div>
              <dt><Database size={16} /> 保存済みアルバム</dt>
              <dd>{stats?.savedAlbums ?? 0}件</dd>
            </div>
            <div>
              <dt><RefreshCw size={16} /> 同期待ち</dt>
              <dd>{stats?.pendingCount ?? 0}件</dd>
            </div>
            <div>
              <dt>最終同期</dt>
              <dd>
                {stats?.lastSyncAt
                  ? new Date(stats.lastSyncAt).toLocaleString("ja-JP")
                  : "未同期"}
              </dd>
            </div>
          </dl>
          {error ? (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={busy || !navigator.onLine}
            onClick={() => void run(onSync)}
          >
            <RefreshCw size={17} /> すべて再同期
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={busy}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 size={17} /> キャッシュを削除
          </button>
          <small>
            キャッシュを削除しても、Supabase上の写真やアルバムは削除されません。
          </small>
        </div>
      </Modal>

      {confirmClear ? (
        <Modal
          title="オフラインキャッシュをすべて削除しますか？"
          onClose={() => setConfirmClear(false)}
          footer={
            <div className="logout-confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setConfirmClear(false)}
              >
                キャンセル
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  setConfirmClear(false);
                  void run(onClear);
                }}
              >
                実行する
              </button>
            </div>
          }
        >
          <p>
            端末内の保存済みデータだけを削除します。この操作は元に戻せません。
          </p>
        </Modal>
      ) : null}
    </>
  );
}
