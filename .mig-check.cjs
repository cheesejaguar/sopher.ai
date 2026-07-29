// Read-only check: has the preview deploy applied migrations 0008-0010 yet?
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

(async () => {
  const rows = await sql`
    select table_name || '.' || column_name as col
    from information_schema.columns
    where (table_name = 'analytics_events')
       or (table_name = 'projects' and column_name in ('completed_at', 'subgenre'))
       or (table_name = 'users' and column_name = 'acquisition')
       or (table_name = 'credit_ledger' and column_name = 'usd_paid')
       or (table_name = 'suggestions' and column_name = 'instruction')
       or (table_name = 'generation_runs' and column_name = 'approval_notes')
    order by 1
  `;
  console.log("applied:", rows.length ? rows.map((r) => r.col).join(", ") : "(none yet)");
})();
