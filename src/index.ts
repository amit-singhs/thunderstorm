import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import apiKeyMiddleware from "./middlewares/apiKeyAuthMiddleware";
import { JwtPayload, TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import supabase from "./supabaseClient";
import { generateToken, verifyToken } from "./utils/jwtUtils";
import { sendEmail } from "./utils/emailUtils";

interface EmailRequestBody {
  email?: string;
}

const app = Fastify({
  logger: true,
  maxParamLength: 300,
});

// Register the middleware
app.addHook("onRequest", apiKeyMiddleware);

// Define a route to test the server
app.get("/hello", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).type("text/plain").send("Hello, World!");
});

app.get("/welcome", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply
    .status(200)
    .type("text/plain")
    .send("Hello Universe, we welcome you all !!");
});

// Define the root route
app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).type("text/html").send(html);
});

// The email route
app.post(
  "/email",
  async (
    request: FastifyRequest<{ Body: EmailRequestBody }>,
    reply: FastifyReply
  ) => {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    // Check if the email exists in the database
    const { data: existingData, error: fetchError } = await supabase
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
          error:
            "The email is not verified, please verify by clicking on the verification link sent to your email.",
        });
      }

      // Check if the token is expired
      try {
        // Await the promise returned by verifyToken
        const decodedToken: JwtPayload = await verifyToken(existingData.token);
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
      } catch (error) {
        // Handle different types of JWT errors
        if (error instanceof TokenExpiredError) {
          return reply.status(401).send({ error: "Token has expired" });
        } else if (error instanceof JsonWebTokenError) {
          return reply.status(401).send({ error: "Invalid token" });
        } else {
          console.error("Unexpected error: ", error);
          return reply.status(500).send({ error: "Internal Server Error" });
        }
      }
    }
  }
);

app.post(
  "/send-verification",
  async (
    request: FastifyRequest<{ Body: EmailRequestBody }>,
    reply: FastifyReply
  ) => {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    // Generate a token
    const token = generateToken({ email }, "1h");

    // Insert the email and token in Supabase
    const { error: supabaseError } = await supabase
      .from("email_verification")
      .insert([{ email, token }])
      .select();

    if (supabaseError) {
      return reply.status(500).send({
        error: "Error updating or inserting email into Supabase",
        details: supabaseError.message,
      });
    }

    // Create the verification link
    const verificationLink = `http://localhost:3000/verify-email/${email}/${token}`;
    const subject = "Email Verification";
    const text = `Please verify your email by clicking on the following link: ${verificationLink}`;

    try {
      // Send the verification email
      await sendEmail(email, subject, text);
      return reply.send({
        status: "success",
        message: "Verification email sent",
      });
    } catch (mailError) {
      return reply.status(500).send({
        error: "Error sending verification email",
        details: mailError,
      });
    }
  }
);

app.get(
  "/verify-email/:email/:token",
  async (
    request: FastifyRequest<{ Params: { email: string; token: string } }>,
    reply: FastifyReply
  ) => {
    const { email, token } = request.params;

    // Check if email exists
    const { data: existingData, error: fetchError } = await supabase
      .from("email_verification")
      .select("*")
      .eq("email", email)
      .single();

    if (fetchError || !existingData) {
      return reply.status(404).send({ error: "Email not found" });
    }

    // Check if token matches
    if (existingData.token !== token) {
      return reply.status(400).send({ error: "Faulty token" });
    }

    // Check token expiration
    try {
      const decodedToken = verifyToken(token) as unknown as JwtPayload;

      if (decodedToken.exp === undefined) {
        return reply
          .status(400)
          .send({ error: "Token does not have an expiration time" });
      }

      if (decodedToken.exp * 1000 < Date.now()) {
        return reply.status(400).send({
          error: "Token is expired, please resend verification link",
        });
      }

      // Token is still valid, update 'verified' flag
      const { error: updateError } = await supabase
        .from("email_verification")
        .update({ verified: true })
        .eq("email", email)
        .select();

      if (updateError) {
        return reply
          .status(500)
          .send({ error: "Failed to update verification status" });
      }

      return reply.send({ status: "success", data: existingData });
    } catch (error) {
      return reply.status(401).send({ error: "Invalid token" });
    }
  }
);

// Export the Fastify instance as a Vercel function
export default async function handler(req: FastifyRequest, res: FastifyReply) {
  await app.ready(); // Ensure the app is ready to handle requests
  app.server.emit("request", req, res); // Emit the request to the Fastify instance
}

app.listen({ port: 3000, host: "0.0.0.0" }, (err, address) => {
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
