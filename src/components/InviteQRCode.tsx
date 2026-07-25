import QRCode from "qrcode";
import { useEffect, useId, useState } from "react";

type QRCodeStatus = "loading" | "ready" | "error";

export function InviteQRCode({ value }: { value: string }) {
  const captionID = useId();
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<QRCodeStatus>("loading");

  useEffect(() => {
    let active = true;
    setSource("");
    setStatus("loading");

    void QRCode.toDataURL(value, {
      width: 232,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#273235", light: "#ffffff" },
    })
      .then((url) => {
        if (!active) return;
        setSource(url);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [value]);

  return (
    <figure
      className="invite-qr"
      aria-labelledby={captionID}
      aria-busy={status === "loading"}
    >
      {status === "ready" && source ? (
        <img
          src={source}
          alt="アルバムの参加申請用QRコード"
          aria-describedby={captionID}
        />
      ) : null}

      {status === "loading" ? (
        <div className="invite-qr__placeholder" role="status" aria-live="polite">
          <span className="share-sr-only">QRコードを作成しています</span>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="invite-qr__error" role="alert">
          QRコードを作成できませんでした。画面を開き直してください。
        </div>
      ) : null}

      <figcaption id={captionID}>
        <strong>QRコードで招待</strong>
        <small>相手のカメラで読み取ると参加申請画面が開きます</small>
      </figcaption>
    </figure>
  );
}
