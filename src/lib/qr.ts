import QRCode from "qrcode";
import { PRINT_SIZE } from "./validation";
export const QR_SIZE = 320;
// Keep the entire white QR tile well inside the artwork, away from product edges.
export const QR_EDGE_INSET = 180;
export const QR_OFFSET = PRINT_SIZE - QR_SIZE - QR_EDGE_INSET;
export function siteQr(url: string) {
  return QRCode.toDataURL(url, {
    width: QR_SIZE,
    margin: 6,
    errorCorrectionLevel: "M",
    color: { dark: "#202b27", light: "#ffffff" },
  });
}
