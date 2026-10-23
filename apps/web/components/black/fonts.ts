import { Anton, JetBrains_Mono } from "next/font/google";

/** The Sathyabama Black wordmark face and its monospaced counterpart. */
export const anton = Anton({ subsets: ["latin"], weight: "400", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], display: "swap" });
