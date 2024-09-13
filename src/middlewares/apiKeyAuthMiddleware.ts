import { FastifyReply, FastifyRequest } from "fastify";

// Middleware to check for API key
export const apiKeyMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
) => {
  console.log("API Key Middleware, request.raw.url is ***************** : ", request.raw.url);
  
  // Skip the middleware for the verification route
  if (request.raw.url?.startsWith("/verify-email/")) {
    return done(); // Return early if it matches
  }
  
  const apiKey = request.headers["x-api-key"];

  // Check if the API key is provided and valid
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return reply.status(403).send({ error: "Forbidden: Invalid API Key" });
  }

  done();
};

export default apiKeyMiddleware;