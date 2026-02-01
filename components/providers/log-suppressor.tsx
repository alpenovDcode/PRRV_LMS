"use client";

import { useEffect } from "react";

export function LogSuppressor() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      const emptyFunc = () => {};
      console.log = emptyFunc;
      console.info = emptyFunc;
      console.warn = emptyFunc;
      console.error = emptyFunc;
      console.debug = emptyFunc;
    }
  }, []);

  return null;
}
