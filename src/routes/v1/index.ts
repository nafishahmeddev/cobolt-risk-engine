import { Hono } from "hono";
import { assessRouter } from "./assess";

const v1Router = new Hono();

v1Router.route("/asses", assessRouter);

export { v1Router };
