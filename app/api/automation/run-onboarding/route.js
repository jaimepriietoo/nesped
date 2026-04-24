import { NextResponse } from "next/server";
import { runOnboardingAutomation } from "@/lib/server/automation-service";
import { requirePortalRoleOrInternal } from "@/lib/server/security";

export async function POST(req) {
  const access = await requirePortalRoleOrInternal(req);
  if (!access.ok) return access.response;

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
