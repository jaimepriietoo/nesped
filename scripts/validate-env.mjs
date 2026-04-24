import dotenv from "dotenv";
import {
  buildEnvReadinessReport,
  formatEnvReadinessLines,
} from "../lib/server/env.mjs";

dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

const report = buildEnvReadinessReport(process.env);

console.log("");
console.log("Nesped production preflight");
console.log("==========================");
console.log(`Runtime: ${report.runtime.nodeEnv} / ${report.runtime.deploymentTarget}`);
console.log(`App URL: ${report.runtime.appUrl || "missing"}`);
console.log(`Base URL: ${report.runtime.baseUrl || "missing"}`);
if (report.runtime.commitSha) {
  console.log(`Commit: ${report.runtime.commitSha}`);
}
console.log("");
report.features.forEach((feature) => {
  const headline = formatEnvReadinessLines({
    ...report,
    features: [feature],
  })[0];
  console.log(headline);

  const missing = [
    ...feature.missingRequired.map((item) => `required: ${item.label}`),
    ...feature.missingRecommended.map((item) => `recommended: ${item.label}`),
  ];

  missing.forEach((item) => console.log(`  ${item}`));
});
console.log("");

if (!report.summary.ready) {
  console.error(
    `Preflight failed: ${report.summary.criticalCount} critical feature groups still have missing required environment variables.`
  );
  process.exit(1);
}

if (report.summary.warningCount) {
  console.warn(
    `Preflight passed with warnings: ${report.summary.warningCount} feature groups still have recommended variables missing.`
  );
} else {
  console.log("Preflight passed with all tracked environment variables configured.");
}
