import type { AppConfig } from "./config";
import type { Db } from "./db";
import type { RateLimiter } from "./lib/rate-limit";

export interface AppContext {
  db: Db;
  config: AppConfig;
  limiter: RateLimiter;
}
