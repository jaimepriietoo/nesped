import { AppBackdrop } from "@/components/site-chrome";

export default function Loading() {
  return (
    <div className="app-shell">
      <AppBackdrop />
      <div className="page-shell">
        <main className="content-frame" style={{ paddingTop: "16vh" }}>
          <div className="empty-state" style={{ minHeight: "320px" }}>
            <div className="stack-24 flex-col items-center">
              <div className="loading-orb" />
              <div className="stack-12" style={{ width: "min(420px, 100%)" }}>
                <div className="skeleton-line" />
                <div className="skeleton-line" style={{ width: "72%", margin: "0 auto" }} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
