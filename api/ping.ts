export default function handler(_request: any, response: any) {
  response.status(200).json({
    ok: true,
    service: "qa-bandung-vercel-ready",
    runtime: `node ${process.version}`,
    handler: "node-req-res",
  });
}
