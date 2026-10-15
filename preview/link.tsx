import type { AnchorHTMLAttributes } from "react";
export default function Link({
  href,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...rest} href={href?.startsWith("/") ? "#" + href : href} />;
}
