import { NextRequest } from "next/server";
import { handle } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export const GET = (req: NextRequest) => handle(req, "resumen");
