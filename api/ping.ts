export function GET() {
  return Response.json({ ok: true, service: "qa-bandung-vercel-ready", runtime: `node ${process.version}` });
}
