import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import apiKeyMiddleware from "./middlewares/apiKeyAuthMiddleware";
import { JwtPayload, TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import supabase from "./supabaseClient";
import rateLimit from "@fastify/rate-limit";
import fastifyCookie from "@fastify/cookie";
import Razorpay from "razorpay";
const app = Fastify({
  logger: true,
  maxParamLength: 300,
});
// Register the middleware
app.addHook("onRequest", apiKeyMiddleware);

app.register(fastifyCookie, {
  hook: "onRequest",
  parseOptions: {}, // options for parsing cookies
});

// Explicitly add CORS headers
app.addHook('onSend', async (request, reply) => {
  reply.header('Access-Control-Allow-Credentials', 'true');
})

// Register the rate limiting plugin first
app.register(rateLimit, {
  max: 1, // Maximum 1 requests
  timeWindow: "1 minute", // Per minute
  keyGenerator: (request) => {
    return request.ip; // Rate limit based on the client's IP address
  },
  global: false, // Apply to all routes
});


// Define a route to test the server
app.get("/hello", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).type("text/plain").send("Hello, World!");
});

app.get("/welcome", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply
    .status(200)
    .type("text/plain")
    .send("Hello Universe, we welcome you all to The Thunderstorm!!");
});

// Define the root route
app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).type("text/html").send("Welcome to the root route of The Thunderstorm.");
});

// Export the Fastify instance as a Vercel function
export default async function handler(req: FastifyRequest, res: FastifyReply) {
  await app.ready(); // Ensure the app is ready to handle requests
  app.server.emit("request", req, res); // Emit the request to the Fastify instance
}

app.listen({ port: 3000, host: "localhost" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
