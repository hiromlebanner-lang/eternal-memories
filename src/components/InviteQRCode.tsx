import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function InviteQRCode({ value }: { value: string }) {
  const [source, setSource] = useState("");

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, {
      width: 232,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#273235", light: "#ffffff" },
    }).then((url) => {
      if (active) setSource(url);
    });
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className="invite-qr">
      {source ? <img src={source} alt="アルバム参加用QRコード" /> : <span />}
      <small>カメラで読み取って参加</small>
    </div>
  );
}
