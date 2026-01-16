import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import type { RadarApiResponse } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Get radar models with filtering
  app.get("/api/radar", async (req, res) => {
    try {
      const availableMonths = await storage.getAvailableMonths();
      
      // Use query params or default to latest month
      const month = (req.query.month as string) || availableMonths[0] || "";
      const nation = (req.query.nation as string) || "domestic";
      const minSales = parseInt(req.query.minSales as string) || 0;
      const excludeNewEntries = req.query.excludeNewEntries === "true";
      const limit = parseInt(req.query.limit as string) || 20;

      // Validate nation parameter
      if (nation !== "domestic" && nation !== "export") {
        return res.status(400).json({ error: "Invalid nation parameter. Use 'domestic' or 'export'." });
      }

      let models = await storage.getRadarModels(month, nation);
      
      // Apply server-side filtering
      models = models.filter((model) => {
        if (model.sales < minSales) return false;
        if (excludeNewEntries && (model.prevSales === 0 || model.prevSales === null)) {
          return false;
        }
        if ((model.momAbs ?? 0) <= 0) return false;
        return true;
      });
      
      // Sort by score descending and limit
      models = models
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, limit);

      const response: RadarApiResponse = {
        month,
        nation: nation as "domestic" | "export",
        models,
        availableMonths,
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching radar data:", error);
      res.status(500).json({ error: "Failed to fetch radar data" });
    }
  });

  // Get available months
  app.get("/api/radar/months", async (_req, res) => {
    try {
      const months = await storage.getAvailableMonths();
      res.json({ months });
    } catch (error) {
      console.error("Error fetching available months:", error);
      res.status(500).json({ error: "Failed to fetch available months" });
    }
  });

  return httpServer;
}
