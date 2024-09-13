"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyMiddleware = void 0;
// Middleware to check for API key
const apiKeyMiddleware = (request, reply, done) => {
    var _a;
    if ((_a = request.raw.url) === null || _a === void 0 ? void 0 : _a.startsWith("/verify-email/")) {
        return; // Skip the middleware for this route
    }
    const apiKey = request.headers["x-api-key"];
    // Check if the API key is provided and valid
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return reply.status(403).send({ error: "Forbidden: Invalid API Key" });
    }
    done();
};
exports.apiKeyMiddleware = apiKeyMiddleware;
exports.default = exports.apiKeyMiddleware;
