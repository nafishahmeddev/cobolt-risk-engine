import { Hono } from "hono";
import { healthRouter } from "./health";
import { v1Router } from "./v1";

const apiRouter = new Hono();

apiRouter.route("/health", healthRouter);
apiRouter.route("/v1", v1Router);

export { apiRouter };
