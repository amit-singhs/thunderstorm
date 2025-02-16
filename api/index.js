"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const fastify_1 = __importDefault(require("fastify"));
const apiKeyAuthMiddleware_1 = __importDefault(require("./middlewares/apiKeyAuthMiddleware"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const app = (0, fastify_1.default)({
    logger: true,
    maxParamLength: 300,
});
// Register the middleware
app.addHook("onRequest", apiKeyAuthMiddleware_1.default);
app.register(cookie_1.default, {
    hook: "onRequest",
    parseOptions: {}, // options for parsing cookies
});
// Explicitly add CORS headers
app.addHook('onSend', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    reply.header('Access-Control-Allow-Credentials', 'true');
}));
// Register the rate limiting plugin first
app.register(rate_limit_1.default, {
    max: 1, // Maximum 1 requests
    timeWindow: "1 minute", // Per minute
    keyGenerator: (request) => {
        return request.ip; // Rate limit based on the client's IP address
    },
    global: false, // Apply to all routes
});
// Define a route to test the server
app.get("/hello", (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply.status(200).type("text/plain").send("Hello, World!");
}));
app.get("/welcome", (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply
        .status(200)
        .type("text/plain")
        .send("Hello Universe, we welcome you all to The Thunderstorm!!");
}));
// Define the root route
app.get("/", (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply.status(200).type("text/html").send("Welcome to the root route of The Thunderstorm.");
}));
// Export the Fastify instance as a Vercel function
function handler(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        yield app.ready(); // Ensure the app is ready to handle requests
        app.server.emit("request", req, res); // Emit the request to the Fastify instance
    });
}
app.listen({ port: 3000, host: "localhost" }, (err, address) => {
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
    app.log.info(`Server listening at ${address}`);
});
