import type { ImgHTMLAttributes } from "react";
export default function Image({
  src,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
}) {
  return <img {...rest} src={typeof src === "string" ? src : src.src} />;
}
