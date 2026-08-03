import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RelativeTime } from "@/components/relative-time";
import { listAllBooks } from "@/db/queries/admin";
import { PageHeader } from "@/components/studio/product-primitives";

export const metadata = { title: "Books — admin" };

export default async function AdminBooks() {
  const books = await listAllBooks();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Books"
        description="Project state, production volume, and open moderation flags."
      />
      <Table aria-label="All books" scrollLabel="All books">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Title</TableHead>
            <TableHead scope="col">Author</TableHead>
            <TableHead scope="col">Genre</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col" className="text-right">
              Chapters
            </TableHead>
            <TableHead scope="col" className="text-right">
              Words
            </TableHead>
            <TableHead scope="col">Flags</TableHead>
            <TableHead scope="col">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {books.map((book) => (
            <TableRow key={book.projectId}>
              <TableCell>
                <Link
                  href={`/admin/books/${book.projectId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {book.title}
                </Link>
                {book.brief ? (
                  <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                    {book.brief}
                  </p>
                ) : null}
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/users/${book.userId}`}
                  className="text-muted-foreground hover:underline"
                >
                  {book.email}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {book.genre ?? "—"}
                {book.tier ? <span className="block text-xs capitalize">{book.tier}</span> : null}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{book.status}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{book.chapters}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {book.words.toLocaleString()}
              </TableCell>
              <TableCell>
                {book.openFlags > 0 ? (
                  <Badge variant="destructive">{book.openFlags}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <RelativeTime iso={book.updatedAt.toISOString()} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
