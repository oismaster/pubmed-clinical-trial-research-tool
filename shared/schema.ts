import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  pmcid: text("pmcid").notNull(),
  doi: text("doi"),
  title: text("title").notNull(),
  firstAuthor: text("first_author").notNull(),
  year: integer("year").notNull(),
  reference: text("reference"),
  reportType: text("report_type"),
  diseaseSite: text("disease_site"),
  histopathology: text("histopathology"),
  tnmStage: text("tnm_stage"),
  overallStage: text("overall_stage"),
  dateRange: text("date_range"),
  trialArms: text("trial_arms"),
  primaryOutcome: text("primary_outcome"),
  secondaryOutcomes: text("secondary_outcomes"),
  statistics: text("statistics"),
  additionalNotes: text("additional_notes"),
  rawData: jsonb("raw_data"),
  processed: boolean("processed").default(false),
});

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  processed: true,
});

export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;

export const searchResultSchema = z.object({
  pmcid: z.string(),
  doi: z.string().optional(),
  title: z.string(),
  authors: z.array(z.string()),
  journal: z.string().optional(),
  year: z.number(),
  abstract: z.string().optional(),
  articleType: z.string().optional(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchRequestSchema = z.object({
  query: z.string().min(1),
  dateFilter: z.string().optional(),
  articleType: z.string().optional(),
  maxResults: z.number().default(50),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
