const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
(async () => {
  console.log(
    "applied migrations:",
    (await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`)
      .length,
  );
  console.log(
    "projects with completed_at:",
    await sql`select count(*)::int as n from projects where completed_at is not null`,
  );
  console.log(
    "completed full_book runs:",
    await sql`select id, project_id, completed_at from generation_runs where kind='full_book' and status='completed'`,
  );
  console.log(
    "project statuses:",
    await sql`select status, count(*)::int as n from projects group by status`,
  );
})();
