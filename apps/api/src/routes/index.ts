import { Router } from "express";
import auth from "./auth";
import items from "./item";
import employees from "./employees";
import reports from "./reports";
import stockMovements from "./stockMovements";
import tableSales from "./tableSales";
import fieldDispatch from "./fieldDispatch";
import fieldReturn from "./fieldReturn";
import { requireAdmin } from "../middlewares/auth";

const r = Router();

// Public/auth
r.use("/auth", auth);

// Core admin-protected resources
r.use("/items", requireAdmin, items);
r.use("/employees", requireAdmin, employees);

// Reporting (admin-protected)
r.use("/reports", requireAdmin, reports);

// Sales & inventory flows (admin-protected)
r.use("/stock-movements", requireAdmin, stockMovements);
r.use("/table-sales", requireAdmin, tableSales);
r.use("/field-dispatch", requireAdmin, fieldDispatch);
r.use("/field-return", requireAdmin, fieldReturn);

export default r;
