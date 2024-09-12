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
const jsonwebtoken_1 = require("jsonwebtoken");
const supabaseClient_1 = __importDefault(require("./supabaseClient"));
const jwtUtils_1 = require("./utils/jwtUtils");
const app = (0, fastify_1.default)({
    logger: true,
});
// Register the middleware
app.addHook('onRequest', apiKeyAuthMiddleware_1.default);
// Define a route to test the server
app.get('/hello', (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply.status(200).type('text/plain').send('Hello, World!');
}));
app.get('/welcome', (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply.status(200).type('text/plain').send('Hello Universe, we welcome you all !!');
}));
// Define the root route
app.get('/', (req, reply) => __awaiter(void 0, void 0, void 0, function* () {
    return reply.status(200).type('text/html').send(html);
}));
// The email route
app.post("/email", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = request.body;
    if (!email) {
        return reply.status(400).send({ error: "Email is required" });
    }
    // Check if the email exists in the database
    const { data: existingData, error: fetchError } = yield supabaseClient_1.default
        .from("email_verification")
        .select("*")
        .eq("email", email)
        .single();
    if (fetchError && fetchError.code !== "PGRST116") {
        // 'PGRST116' means no rows found
        return reply.status(500).send({
            error: "Error fetching email data",
            details: fetchError.message,
        });
    }
    if (fetchError && fetchError.code === "PGRST116") {
        return reply
            .status(404)
            .send({ error: "Email not registrered in the app." });
    }
    if (existingData) {
        // Check if email is verified
        if (!existingData.verified) {
            return reply.status(403).send({
                error: "The email is not verified, please verify by clicking on the verification link sent to your email.",
            });
        }
        // Check if the token is expired
        try {
            // Await the promise returned by verifyToken
            const decodedToken = yield (0, jwtUtils_1.verifyToken)(existingData.token);
            // Check if token has an expiration time
            if (decodedToken.exp === undefined) {
                return reply
                    .status(401)
                    .send({ error: "Token does not have an expiration time" });
            }
            // Check if the token has expired
            if (decodedToken.exp * 1000 < Date.now()) {
                return reply.status(401).send({
                    error: "Email was sent already, but the JWT token has expired",
                });
            }
            // If everything is okay, send success response
            return reply.send({ status: "success", data: existingData });
        }
        catch (error) {
            // Handle different types of JWT errors
            if (error instanceof jsonwebtoken_1.TokenExpiredError) {
                return reply.status(401).send({ error: "Token has expired" });
            }
            else if (error instanceof jsonwebtoken_1.JsonWebTokenError) {
                return reply.status(401).send({ error: "Invalid token" });
            }
            else {
                console.error("Unexpected error: ", error);
                return reply.status(500).send({ error: "Internal Server Error" });
            }
        }
    }
}));
// Export the Fastify instance as a Vercel function
function handler(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        yield app.ready(); // Ensure the app is ready to handle requests
        app.server.emit('request', req, res); // Emit the request to the Fastify instance
    });
}
app.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
    app.log.info(`Server listening at ${address}`);
});
// HTML content
const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@exampledev/new.css@1.1.2/new.min.css"
    />
    <title>Vercel + Fastify Hello World</title>
    <meta
      name="description"
      content="This is a starter template for Vercel + Fastify."
    />
  </head>
  <body>
    <h1>Vercel + Fastify Hello World</h1>
    <p>
      This is a starter template for Vercel + Fastify. Requests are
      rewritten from <code>/*</code> to <code>/api/*</code>, which runs
      as a Vercel Function.
    </p>
    <p>
        For example, here is the boilerplate code for this route:
    </p>
    <pre>
<code>import Fastify from 'fastify'

const app = Fastify({
  logger: true,
})

app.get('/', async (req, res) => {
  return res.status(200).type('text/html').send(html)
})

export default async function handler(req: any, res: any) {
  await app.ready()
  app.server.emit('request', req, res)
}</code>
    </pre>
    <p>
      <a href="https://vercel.com/templates/other/fastify-serverless-function">
      Deploy your own
      </a>
      to get started.
  </body>
</html>
`;
