import * as Sentry from "@sentry/nextjs";
import { initClientSentry } from "@/lib/sentry.client";

initClientSentry();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
