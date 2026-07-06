
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_API_SECRET;
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { files } = await req.json();
  
  for (const file of files) {
    await prisma.generatedFile.upsert({
      where: { path: file.path },
      update: file,
      create: file,
    });
  }
  
  return NextResponse.json({ indexed: files.length });
}
