import { NextResponse } from "next/server";
import { runFunnelAutomation } from "@/lib/server/automation-service";

export async function POST() {
  try {
    const result = await runFunnelAutomation();
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error ejecutando funnel automático",
    });
  }
}
