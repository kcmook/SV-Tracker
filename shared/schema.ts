import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Radar Model Data
export const radarModels = pgTable("radar_models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  month: text("month").notNull(), // YYYY-MM format
  nation: text("nation").notNull(), // 'domestic' | 'export'
  rank: integer("rank").notNull(),
  prevRank: integer("prev_rank"),
  modelName: text("model_name").notNull(),
  brand: text("brand").notNull(),
  sales: integer("sales").notNull(),
  prevSales: integer("prev_sales"),
  momAbs: integer("mom_abs"), // month-over-month absolute change
  momPct: real("mom_pct"), // month-over-month percentage change
  rankChange: integer("rank_change"), // positive = improved
  score: real("score"), // composite score for ranking
  sourceUrl: text("source_url"),
});

export const insertRadarModelSchema = createInsertSchema(radarModels).omit({
  id: true,
});

export type InsertRadarModel = z.infer<typeof insertRadarModelSchema>;
export type RadarModel = typeof radarModels.$inferSelect;

// API response types
export interface RadarApiResponse {
  month: string;
  nation: 'domestic' | 'export';
  models: RadarModel[];
  availableMonths: string[];
}

export interface FilterOptions {
  minSales: number;
  excludeNewEntries: boolean;
}
