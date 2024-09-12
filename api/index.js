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
