import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireInternalApiSecret } from "@/lib/internal-api-auth";
import {
  classifyGuardianRecord,
  parseGuardianPayload,
  unavailableGuardianResponse,
} from "@/lib/guardian-status";

export const dynamic = "force-dynamic";

const STORE_KEY = "mac-mini-guardian-status";

interface GuardianRouteDependencies {
  findStatus: () => Promise<{ data: unknown; updatedAt: Date } | null>;
  saveStatus: (data: ReturnType<typeof parseGuardianPayload>) => Promise<{
    data: unknown;
    updatedAt: Date;
  }>;
  now: () => number;
}

export function createGuardianStatusHandlers(dependencies: GuardianRouteDependencies) {
  return {
    GET: async () => {
      try {
        const record = await dependencies.findStatus();
        return NextResponse.json(classifyGuardianRecord(record, dependencies.now));
      } catch {
        return NextResponse.json(unavailableGuardianResponse(), { status: 503 });
      }
    },
    POST: async (req: NextRequest) => {
      const authorizationError = requireInternalApiSecret(req);
      if (authorizationError) return authorizationError;

      const body = await req.json().catch(() => null);
      let payload;
      try {
        payload = parseGuardianPayload(body, { now: dependencies.now });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid Guardian payload" },
          { status: 400 },
        );
      }

      try {
        const record = await dependencies.saveStatus(payload);
        return NextResponse.json(classifyGuardianRecord(record, dependencies.now));
      } catch {
        return NextResponse.json(
          { ...unavailableGuardianResponse(), error: "Failed to persist Guardian status" },
          { status: 503 },
        );
      }
    },
  };
}

const handlers = createGuardianStatusHandlers({
  findStatus: () => prisma.dataStore.findUnique({ where: { key: STORE_KEY } }),
  saveStatus: (data) => prisma.dataStore.upsert({
    where: { key: STORE_KEY },
    create: { key: STORE_KEY, data: data as unknown as Prisma.InputJsonValue },
    update: { data: data as unknown as Prisma.InputJsonValue },
  }),
  now: Date.now,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
