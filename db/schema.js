import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const users = sqliteTable('users', {
  username: text().primaryKey(), hash: text().notNull(), creator: integer().notNull(), approver: integer().notNull()
});
export const sessions = sqliteTable('sessions', {
  digest: text().primaryKey(), username: text().notNull().references(()=>users.username), expires: integer().notNull()
});
export const pos = sqliteTable('pos', {
  id: text().primaryKey(), owner: text().notNull().references(()=>users.username),
  number: text().notNull().unique(), date: text().notNull(), vendor: text().notNull(), items: text().notNull(),
  total: integer().notNull(), pdf: text().notNull(), status: text().notNull().default('DRAFT'),
  revision: integer().notNull().default(1), operation: text(), extraction: text()
});
export const history = sqliteTable('history', {
  sequence: integer().primaryKey({autoIncrement:true}), po: text().notNull().references(()=>pos.id),
  actor: text().notNull().references(()=>users.username), action: text().notNull(), remark: text().notNull(),
  time: text().notNull().default(sql`CURRENT_TIMESTAMP`)
});
