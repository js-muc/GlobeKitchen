// apps/api/src/docs/openapi.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import swaggerJSDoc from "swagger-jsdoc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// project root = apps/api
const ROOT = path.resolve(__dirname, "..", "..");

// Allow override; default to dev URL
const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000/api";

// Build-time + run-time globs (src for dev, dist for prod)
const apisGlobs = [
  path.join(ROOT, "src/routes/**/*.ts"),
  path.join(ROOT, "src/routes/**/*.js"),
  path.join(ROOT, "dist/routes/**/*.js"),
];

export const openapiSpec: any = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "GlobeKitchen API",
      version: "1.0.0",
      description:
        "Internal API for GlobeKitchen. Authenticated endpoints require a Bearer JWT.",
    },
    servers: [{ url: apiBaseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Paste your token as: `Bearer <jwt>`",
        },
      },
    },
    // Default security; specific routes can override in JSDoc
    security: [{ bearerAuth: [] }],
  },
  apis: apisGlobs,
});

// ---- Ensure critical endpoints appear even if JSDoc blocks are missing ----

// helper
const anyObj = { type: "object", additionalProperties: true };
const okJson = (schema: any = anyObj) => ({
  description: "OK",
  content: { "application/json": { schema } },
});

// Ensure structure
openapiSpec.paths = openapiSpec.paths || {};
openapiSpec.tags = openapiSpec.tags || [];

// Tag registry (avoid dupes)
const addTag = (name: string, description?: string) => {
  if (!openapiSpec.tags.some((t: any) => t.name === name)) {
    openapiSpec.tags.push({ name, description });
  }
};

// 1) Orders → /orders/{id}/print (receipt printing)
addTag("Orders", "Orders & receipt printing");
openapiSpec.paths["/orders/{id}/print"] = openapiSpec.paths["/orders/{id}/print"] ?? {
  post: {
    tags: ["Orders"],
    summary: "Print order receipt (priced)",
    description:
      "Generates HTML/Text/ESC-POS. Optionally sends ESC/POS bytes to a network printer if configured on the server.",
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { oneOf: [{ type: "integer" }, { type: "string" }] },
        description: "Order ID",
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              copies: { type: "string", enum: ["customer", "both"], default: "customer" },
              sendToPrinter: { type: "boolean", default: false },
            },
          },
          examples: {
            previewOnly: { value: { copies: "customer", sendToPrinter: false } },
            twoCopiesAndPrinter: { value: { copies: "both", sendToPrinter: true } },
          },
        },
      },
    },
    responses: {
      200: okJson({
        type: "object",
        properties: {
          printed: { type: "boolean" },
          printedCopies: { type: "array", items: { type: "string" } },
          copies: { type: "array", items: { type: "string" } },
          htmlByCopy: { type: "object", additionalProperties: { type: "string" } },
          textByCopy: { type: "object", additionalProperties: { type: "string" } },
          escposByCopyBase64: { type: "object", additionalProperties: { type: "string" } },
        },
      }),
      400: { description: "Invalid request" },
      404: { description: "Order not found" },
      500: { description: "Failed to print receipt" },
    },
  },
};

// 2) Common tags to improve grouping if JSDoc is missing in some files
[
  ["Auth", "Authentication endpoints"],
  ["Items", "Menu/items management"],
  ["Employees", "Employees and roles"],
  ["Reports", "Reporting endpoints"],
  ["Stock Movements", "Stock-in/out movements"],
  ["Table Sales", "In-house/table sales"],
  ["Field Dispatch", "Field operations (dispatch/return/get/list)"],
  ["Field Commission", "Field worker commission summaries"],
  ["Salary Deductions", "Deductions management"],
  ["Payroll", "Payroll processing"],
  ["Stock", "Stock catalog and quantities"],
  ["Shifts", "Shifts and daily-sales shift views"],
  ["Daily Sales", "Daily sales namespace & aliases"],
  ["Menu Items", "Quick lookup for menu items"],
  ["Inside Commission", "Inside waiter commission/commission plans"],
].forEach(([name, desc]) => addTag(name as string, desc as string));
