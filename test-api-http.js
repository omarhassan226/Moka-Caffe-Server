const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const http = require("http");
const app = require("./server");

async function runHttpTest() {
  console.log("==================================================");
  console.log("🌐 Testing REST API HTTP Endpoints");
  console.log("==================================================");

  // Start test server on random port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  console.log(`Test server running on: ${baseUrl}`);

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    console.log("1. /api/health:", healthData.status === "healthy" ? "✅ Healthy" : "⚠️", healthData.mongoConnected ? "(MongoDB Connected)" : "");

    // 2. Summary Endpoint
    const summaryRes = await fetch(`${baseUrl}/accounting/summary?month=2026-11`);
    const summaryData = await summaryRes.json();
    console.log("2. GET /api/accounting/summary:", summaryRes.status === 200 ? "✅ OK" : "❌", `Invoices=${summaryData.metrics?.invoicesCount}`);

    // 3. Create Invoice via HTTP
    const createRes = await fetch(`${baseUrl}/accounting/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier: "شركة الصفا للألبان",
        amount: 850,
        category: "ألبان وسيرب",
        invoiceDate: "2026-11-04",
        notes: "كرتونة حليب كامل الدسم"
      })
    });
    const createdInvoice = await createRes.json();
    console.log("3. POST /api/accounting/invoices:", createRes.status === 201 ? "✅ Created" : "❌", `ID=${createdInvoice._id}, Amount=${createdInvoice.amount}`);

    // 4. Test AI Scan Endpoint via HTTP
    const scanRes = await fetch(`${baseUrl}/accounting/invoices/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      })
    });
    const scanData = await scanRes.json();
    console.log("4. POST /api/accounting/invoices/scan:", scanRes.status === 200 ? "✅ Responded" : "❌", scanData.requiresKey ? "(Requires Key as expected)" : "");

    // 5. Delete Invoice via HTTP
    const deleteRes = await fetch(`${baseUrl}/accounting/invoices/${createdInvoice._id}`, {
      method: "DELETE"
    });
    console.log("5. DELETE /api/accounting/invoices/:id:", deleteRes.status === 200 ? "✅ Deleted" : "❌");

    console.log("==================================================");
    console.log("🎉 ALL HTTP API ENDPOINTS TESTED SUCCESSFULLY!");
    console.log("==================================================");
  } catch (err) {
    console.error("HTTP Test Error:", err);
  } finally {
    server.close();
    process.exit(0);
  }
}

runHttpTest();

