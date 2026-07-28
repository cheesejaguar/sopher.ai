// The standalone pdfkit build inlines the standard-font AFM data, so it needs
// no filesystem access at runtime — safe under both Next.js and the workflow
// step bundler. It exports the same constructor as the main entry.
declare module "pdfkit/js/pdfkit.standalone.js" {
  import PDFDocument from "pdfkit";
  export default PDFDocument;
}
