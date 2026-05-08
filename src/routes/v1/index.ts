import { Hono } from "hono";
import { riskRouter } from "./risk";
import { profileRouter } from "./profile";

const v1Router = new Hono();

v1Router.route("/risk", riskRouter);
v1Router.route("/profile", profileRouter);

export { v1Router };
