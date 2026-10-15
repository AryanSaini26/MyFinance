import { useSyncExternalStore } from "react";
export const path = () => location.hash.slice(1).split("?")[0] || "/";
const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
export const usePathname = () =>
  useSyncExternalStore(subscribe, path, () => "/");
export const useRouter = () => router;
const router = {
  push: (href: string) => {
    location.hash = href;
  },
  replace: (href: string) => {
    history.replaceState(null, "", "#" + href);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  },
};
