// apps/api/src/docs/openapi.ts
import swaggerJSDoc from "swagger-jsdoc";

/**
 * You can override the server URL via env:
 *   API_BASE_URL=http://localhost:4000/api
 * Otherwise we default to the local dev URL.
 */
const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000/api";

export const openapiSpec = swaggerJSDoc({
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
    security: [{ bearerAuth: [] }], // default security; routes can override
  },
  // Pick up OpenAPI JSDoc comments from your route files
  apis: ["./src/routes/**/*.ts"],
});
