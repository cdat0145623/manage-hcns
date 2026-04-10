import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
 
import { taskMasters } from "./tasks";
 
export const frequences = pgTable("frequence", {
  id: uuid("id")
    .notNull()
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  name: text("name").notNull(),
  rruleString: text("rruleString").notNull(),
  dtStart: timestamp("dtStart", { mode: "date" }),
  createAt: timestamp("createAt").notNull().defaultNow(),
  updateAt: timestamp("updateAt").notNull().defaultNow(),
});
 
export const frequencesRelations = relations(frequences, ({ many }) => ({
  taskMasters: many(taskMasters),
}));
 