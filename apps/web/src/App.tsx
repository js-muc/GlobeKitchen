// apps/web/src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import React, { Suspense, lazy } from "react";

const PrintReceiptTool = lazy(() => import("./pages/PrintReceiptTool"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-4">Loading…</div>}>
        <Routes>
          <Route path="/tools/print" element={<PrintReceiptTool />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
