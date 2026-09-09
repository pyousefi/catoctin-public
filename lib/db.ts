import { neon } from "@neondatabase/serverless";
import { env } from "./config";
export const db = () => neon(env("DATABASE_URL"));
export type Photo = {
  id: string;
  year: number;
  name: string;
  contributor: string;
  caption: string;
  size: number;
  content_type: string;
  pathname: string;
  status: "pending" | "ready" | "archived";
  hidden: boolean;
  created_at: string;
  transferred_at: string | null;
};
export async function listPhotos(
  year: number,
  admin = false,
  page = 1,
  limit = 24,
): Promise<Photo[]> {
  const sql = db();
  return (await sql`SELECT id, year, name, contributor, caption, size, content_type, pathname, status, created_at, transferred_at, hidden
    FROM photos WHERE year = ${year} AND status = 'ready'
    AND (${admin} OR hidden = false) ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`) as Photo[];
}
