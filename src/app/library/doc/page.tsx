import { getDocFile } from "@/lib/agentos";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DocPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const params = await searchParams;
  const relPath = params.path;

  if (!relPath) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto min-h-screen text-slate-200">
        <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white">Doc Viewer</h1>
        <p className="text-slate-400">No document path specified.</p>
        <Link href="/library" className="text-cyan-400 hover:text-cyan-300 underline mt-4 inline-block">
          ← Back to Library
        </Link>
      </div>
    );
  }

  const content = await getDocFile(relPath);

  if (!content) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto min-h-screen text-slate-200">
        <h1 className="text-[36px] font-black tracking-[-0.04em] mb-2 text-white">Doc Viewer</h1>
        <p className="text-slate-400">Document not found or access denied: <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--panel)" }}>{relPath}</code></p>
        <Link href="/library" className="text-cyan-400 hover:text-cyan-300 underline mt-4 inline-block">
          ← Back to Library
        </Link>
      </div>
    );
  }

  const docName = relPath.split("/").pop() || relPath;

  return (
    <div className="p-8 max-w-[1000px] mx-auto min-h-screen text-slate-200">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/library" className="text-[12px] text-cyan-400 hover:text-cyan-300 mb-1 inline-block">
            ← Back to Library
          </Link>
          <h1 className="text-[28px] font-black tracking-[-0.03em] text-white">{docName}</h1>
          <p className="text-[12px] text-slate-500 font-mono">{relPath}</p>
        </div>
        <a
          href={`/api/files?path=${encodeURIComponent("/home/oggie/AI/AgentOS/" + relPath)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-bold text-slate-400 hover:text-white underline underline-offset-2"
        >
          Raw →
        </a>
      </div>
      <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}