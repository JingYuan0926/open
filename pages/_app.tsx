import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Providers } from "@/lib/providers";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Component {...pageProps} />
    </Providers>
  );
}
