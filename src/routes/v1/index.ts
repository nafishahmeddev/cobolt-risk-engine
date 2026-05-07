import { Hono } from "hono";
import { riskRouter } from "./risk";

const v1Router = new Hono();

v1Router.route("/risk", riskRouter);

export { v1Router };
