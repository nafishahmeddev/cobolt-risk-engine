import { Hono } from "hono";
import { demoRouter } from "./demo";
import { protectedRouter } from "./protected";
import { riskRouter } from "./risk";

const v1Router = new Hono();

v1Router.route("/demo", demoRouter);
v1Router.route("/risk", riskRouter);
v1Router.route("/", protectedRouter);

export { v1Router };
