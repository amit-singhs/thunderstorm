"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyMiddleware = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Middleware to check for API key
const apiKeyMiddleware = (request, reply, done) => {
    const apiKey = request.headers["x-api-key"];
    // Check if the API key is provided and valid
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return reply.status(403).send({ error: "Forbidden: Invalid API Key" });
    }
    done();
};
exports.apiKeyMiddleware = apiKeyMiddleware;
exports.default = exports.apiKeyMiddleware;
