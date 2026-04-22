import { Suspense } from "react";
import SetupAccountClient from "./SetupAccountClient";

export default function PortalSetupAccountPage() {
  return (
    <Suspense fallback={null}>
      <SetupAccountClient />
    </Suspense>
  );
}
