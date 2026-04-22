import { NextResponse } from "next/server";
import { runOnboardingAutomation } from "@/lib/server/automation-service";

export async function POST() {
  try {
    const result = await runOnboardingAutomation();
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error ejecutando onboarding automático",
    });
  }
}
