import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import svgsRouter from "./routes/svgs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === "production";

app.use(express.json({ limit: "1mb" }));

if (!isProd) {
  app.use(cors());
}

app.use("/api/svgs", svgsRouter);

if (isProd) {
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
