import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekConcurrency: parseInt(process.env.DEEPSEEK_CONCURRENCY || "4", 10),
  nodeEnv: process.env.NODE_ENV || "development",
};
