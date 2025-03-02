import { FastifyReply, FastifyRequest } from "fastify";
import dotenv from 'dotenv';
dotenv.config();

// Middleware to check for API key
const apiKeyMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  const apiKey = request.headers["x-api-key"];

  // Check if the API key is provided and valid
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return reply.status(403).send({ error: "Forbidden: Invalid API Key" });
  }
};

export default apiKeyMiddleware;