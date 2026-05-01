import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { Providers } from "@/lib/providers";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Head>
        <title>Right-Hand AI</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </Providers>
  );
}
