import { NextRequest } from "next/server";
import { handle } from "@/lib/server/api";
export const POST = (req: NextRequest) => handle(req, "eliminar");
