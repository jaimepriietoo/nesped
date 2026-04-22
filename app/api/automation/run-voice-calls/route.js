import { NextResponse } from "next/server";
import { runVoiceCallsAutomation } from "@/lib/server/automation-service";

export async function POST() {
  try {
    const result = await runVoiceCallsAutomation();
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error ejecutando llamadas IA",
    });
  }
}
