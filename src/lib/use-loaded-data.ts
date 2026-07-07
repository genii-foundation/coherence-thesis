"use client";

import { useEffect, useState } from "react";

// Load-once-on-mount data fetch with the mounted guard that several islands
// repeated by hand (DUP-06). Returns the fallback until the loader resolves, and
// on failure. Pass a stable loader (a module-level function) and a stable
// fallback (a module-level constant) so the effect runs once; both are in the
// dependency array, so an inline `[]` fallback would refetch on every render.
export function useLoadedData<T>(loader: () => Promise<T>, fallback: T): T {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    let active = true;
    loader()
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setData(fallback);
      });
    return () => {
      active = false;
    };
  }, [loader, fallback]);
  return data;
}
