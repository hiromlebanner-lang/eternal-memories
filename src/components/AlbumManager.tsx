import {
  ArrowRight,
  Check,
  Image,
  Plus,
  TicketCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Album } from "../types";
import { formatErrorMessage } from "../lib/errors";
import { Modal } from "./Modal";

interface AlbumManagerProps {
  albums: Album[];
  currentUserID: string;
  selectedAlbumID?: string;
  onClose: () => void;
  onSelect: (albumID: string) => void;
  onCreate: (name: string, description: string) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
  onDelete: (albumID: string) => Promise<void>;
}

export function AlbumManager({
  albums,
  currentUserID,
  selectedAlbumID,
  onClose,
  onSelect,
  onCreate,
  onJoin,
  onDelete,
}: AlbumManagerProps) {
  const [action, setAction] = useState<"list" | "create" | "join">("list");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim(), description.trim());
      onClose();
    } catch (caught) {
      setError(formatErrorMessage(caught, "作成できませんでした。"));
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onJoin(code.trim());
      onClose();
    } catch (caught) {
      setError(formatErrorMessage(caught, "参加できませんでした。"));
    } finally {
      setBusy(false);
    }
  };

  const selectedAlbum = albums.find((album) => album.id === selectedAlbumID);
  const deleteSelectedAlbum = async () => {
    if (!selectedAlbum || selectedAlbum.owner_id !== currentUserID) return;
    if (!window.confirm(`「${selectedAlbum.name}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onDelete(selectedAlbum.id);
      onClose();
    } catch (caught) {
      setError(
        formatErrorMessage(caught, "アルバムを削除できるのはオーナーだけです"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={
        action === "create"
          ? "アルバムを作成"
          : action === "join"
            ? "参加を申請"
            : "共有アルバム"
      }
      onClose={onClose}
    >
      {action === "list" ? (
        <div className="album-manager">
          <div className="album-list">
            {albums.map((album) => (
              <button
                type="button"
                key={album.id}
                className={album.id === selectedAlbumID ? "album-row is-selected" : "album-row"}
                onClick={() => {
                  onSelect(album.id);
                  onClose();
                }}
              >
                <span
                  className="album-row__cover"
                  style={
                    album.cover_url
                      ? { backgroundImage: `url("${encodeURI(album.cover_url)}")` }
                      : undefined
                  }
                >
                  {!album.cover_url ? <Image size={22} /> : null}
                </span>
                <span className="album-row__text">
                  <strong>{album.name}</strong>
                  <small>
                    <Image size={13} />
                    {album.photo_count ?? 0}
                    <Users size={13} />
                    {album.member_count ?? 1}
                  </small>
                </span>
                {album.id === selectedAlbumID ? <Check size={19} /> : <ArrowRight size={17} />}
              </button>
            ))}
          </div>

          <div className="album-manager__actions">
            {selectedAlbum?.owner_id === currentUserID ? (
              <button
                className="danger-button"
                type="button"
                disabled={busy}
                onClick={deleteSelectedAlbum}
              >
                <Trash2 size={19} />
                <span>
                  <strong>このアルバムを削除</strong>
                  <small>オーナーだけが実行できます</small>
                </span>
              </button>
            ) : null}
            <button type="button" onClick={() => setAction("create")}>
              <Plus size={19} />
              <span>
                <strong>新しいアルバム</strong>
                <small>あなたがオーナーになります</small>
              </span>
            </button>
            <button type="button" onClick={() => setAction("join")}>
              <TicketCheck size={19} />
              <span>
                <strong>招待コードで申請</strong>
                <small>承認されるとアルバムに参加できます</small>
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {action === "create" ? (
        <form className="stack-form" onSubmit={submitCreate}>
          <label className="field">
            <span>アルバム名</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例：北海道旅行 2026"
              maxLength={80}
              required
            />
          </label>
          <label className="field">
            <span>説明</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="どんなアルバムですか？"
              rows={3}
              maxLength={300}
            />
          </label>
          {error ? <p className="form-message form-message--error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>
            <Plus size={18} />
            {busy ? "作成中…" : "アルバムを作成"}
          </button>
          <button className="text-button" type="button" onClick={() => setAction("list")}>
            戻る
          </button>
        </form>
      ) : null}

      {action === "join" ? (
        <form className="stack-form" onSubmit={submitJoin}>
          <div className="join-illustration">🎟️</div>
          <p className="form-intro">
            受け取った招待コードを入力してください。オーナーまたは管理者へ参加申請を送ります。
          </p>
          <label className="field">
            <span>招待コード</span>
            <input
              className="code-input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              autoCapitalize="characters"
              required
            />
          </label>
          {error ? <p className="form-message form-message--error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>
            <TicketCheck size={18} />
            {busy ? "申請中…" : "参加を申請"}
          </button>
          <button className="text-button" type="button" onClick={() => setAction("list")}>
            戻る
          </button>
        </form>
      ) : null}
    </Modal>
  );
}
