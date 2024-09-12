import { FastifyReply, FastifyRequest } from "fastify";

// Middleware to check for API key
export const apiKeyMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
) => {
  const apiKey = request.headers["x-api-key"]; 

  // Check if the API key is provided and valid
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return reply.status(403).send({ error: "Forbidden: Invalid API Key" });
  }

  done();
};

export default apiKeyMiddleware;