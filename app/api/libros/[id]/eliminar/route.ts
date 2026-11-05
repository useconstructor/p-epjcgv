import { NextRequest } from "next/server";
import { handle } from "@/lib/server/api";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(req, "eliminar", id);
}
