export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fileId = url.searchParams.get("id");
    const authHeader = request.headers.get("authorization");

    if (!fileId) {
      return Response.json({ error: "ID file (id) wajib diisi." }, { status: 400 });
    }
    if (!authHeader) {
      return Response.json({ error: "Token otorisasi diperlukan." }, { status: 401 });
    }

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
    const upstream = await fetch(driveUrl, {
      method: "GET",
      headers: { Authorization: authHeader },
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return Response.json(
        { error: `Gagal mengunduh berkas dari Google Drive via proxy: ${errText}` },
        { status: upstream.status }
      );
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    const contentDisposition = upstream.headers.get("content-disposition");
    if (contentType) headers.set("content-type", contentType);
    if (contentDisposition) headers.set("content-disposition", contentDisposition);
    headers.set("cache-control", "private, no-store");

    return new Response(upstream.body, { status: 200, headers });
  } catch (error: any) {
    console.error("GDrive proxy failed:", error);
    return Response.json(
      { error: error?.message || "Gagal mengunduh file dari Google Drive." },
      { status: 500 }
    );
  }
}
