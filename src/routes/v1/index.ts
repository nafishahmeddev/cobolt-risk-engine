import { Hono } from "hono";
import { profileRouter } from "./profile";
import { riskRouter } from "./risk";

const v1Router = new Hono();

v1Router.route("/risk", riskRouter);
v1Router.route("/profile", profileRouter);

export { v1Router };
