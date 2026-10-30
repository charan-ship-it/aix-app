"use client";
import { useEffect } from "react";
export default function ConnectionCallback() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "aix-app-connected" }, location.origin);
      window.close();
    }
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Return to your workspace</h1>
        <p>
          Authorization has finished. Your workspace will check the connection
          status.
        </p>
        <a className="primary full" href="/?view=integrations">
          Open Connections
        </a>
      </section>
    </main>
  );
}
