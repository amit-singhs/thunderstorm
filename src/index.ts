import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import apiKeyMiddleware from "./middlewares/apiKeyAuthMiddleware";
import { JwtPayload, TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import supabase from "./supabaseClient";
import { generateToken, verifyToken } from "./utils/jwtUtils";
import { sendEmail } from "./utils/emailUtils";
import rateLimit from "@fastify/rate-limit";
import fastifyCookie from "@fastify/cookie";
import Razorpay from "razorpay";
import crypto from "crypto";
import fastifyCors from "@fastify/cors";

interface EmailRequestBody {
  email?: string;
}

type Testator = {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string;
  father_name: string;
  nationality: string;
  address: string;
  will_declaration: string;
};

interface Executor {
  id: string;
  user_id: string;
  full_name: string;
  father_name: string;
  date_of_birth: string;
  nationality: string;
  address: string;
  consent: string;
}

interface Beneficiary {
  id: string;
  user_id: string;
  full_name: string;
  father_name: string;
  date_of_birth: string;
  relationship_with_testator: string;
  address: string;
  share: string;
}

interface Witness {
  id: string;
  user_id: string;
  full_name: string;
  father_name: string;
  address: string;
  contact: number;
  email: string;
}

interface UserDataResponse {
  testator: Testator;
  executors: Executor[];
  beneficiaries: Beneficiary[];
  witnesses: Witness[];
}

const app = Fastify({
  logger: true,
  maxParamLength: 300,
});

const getAllowedOrigins = () => {
  const origins = [
    "https://sadev-wills.vercel.app", // Production frontend
    "http://localhost:5173", // Development frontend
  ];

  return process.env.NODE_ENV === "production"
    ? "https://sadev-wills.vercel.app" // In production, be specific
    : origins; // In development, allow both
};

// Register the rate limiting plugin first
app.register(rateLimit, {
  max: 1, // Maximum 1 requests
  timeWindow: "1 minute", // Per minute
  keyGenerator: (request) => {
    return request.ip; // Rate limit based on the client's IP address
  },
  global: false, // Apply to all routes
});

// Register the cookie plugin to parse cookies
app.register(fastifyCookie, {
  hook: "onRequest",
  parseOptions: {}, // options for parsing cookies
});


// Register the CORS plugin after cookies
app.register(fastifyCors, {
  origin: getAllowedOrigins(), // Frontend origin
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "x-api-key",
    "Authorization",
    "Origin",
    "Accept",
  ], // Cookie is not typically sent in allowed headers
  exposedHeaders: ["Set-Cookie"],
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
  return reply.status(200).type("text/html").send("Welcome to the root route.");
});

// The login route, through email
app.post(
  "/login",
  async (
    request: FastifyRequest<{ Body: { email: string } }>,
    reply: FastifyReply
  ) => {
    const { email } = request.body;

    if (!email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    const { data: existingData, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      return reply.status(500).send({
        error: "Error fetching email data",
        details: fetchError.message,
      });
    }

    if (fetchError && fetchError.code === "PGRST116") {
      return reply
        .status(404)
        .send({ error: "Email not registered in the app." });
    }

    if (existingData) {
      if (!existingData.verified) {
        return reply.status(403).send({
          error: "The email is not verified.",
        });
      }

      let newToken = "";
      try {
        newToken = generateToken({ email, id: existingData.id }, "1h");
        const isProduction = process.env.NODE_ENV === "production";
        // Set the cookie
        reply.setCookie("access-token", newToken, {
          secure: isProduction,
          httpOnly: true,
          path: "/",
          sameSite: isProduction ? "none" : "lax",
          domain: isProduction ? "sadev-wills.vercel.app" : "localhost",
          maxAge: 60 * 60 * 1000, // 1 hours in milisecond
        });

        return reply.send({ status: "success" });
      } catch (error) {
        console.error("Token generation error: ", error);
        return reply.status(500).send({ error: "Internal Server Error" });
      }
    }
  }
);

app.post(
  "/update-token",
  async (
    request: FastifyRequest<{ Body: EmailRequestBody }>,
    reply: FastifyReply
  ) => {
    const { email } = request.body;

    // Check if the email is provided
    if (!email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    // Query Supabase for the email
    const { data: existingData, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // Handle errors other than 'no rows found'
      return reply.status(500).send({
        error: "Error fetching email data",
        details: fetchError.message,
      });
    }

    if (fetchError && fetchError.code === "PGRST116") {
      // Email not found
      return reply
        .status(404)
        .send({ error: "Email not registered in the app." });
    }

    if (existingData) {
      // Check if the email is verified
      if (!existingData.verified) {
        return reply.status(403).send({
          error: "The email is not verified, hence token cannot be updated.",
        });
      }

      // Generate a new token
      try {
        const newToken = generateToken({ email }, "1h");

        // Update Supabase with the new token
        const { data: updatedData, error: updateError } = await supabase
          .from("users")
          .update({ token: newToken })
          .eq("email", email)
          .select();

        if (updateError) {
          return reply.status(500).send({
            error: "Error updating token",
            details: updateError.message,
          });
        }

        // Send the response with the updated data
        return reply.send({ status: "success", data: updatedData });
      } catch (error) {
        console.error("Unexpected error while generating token:", error);
        return reply.status(500).send({ error: "Internal Server Error" });
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
      .from("users")
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
  {
    config: {
      rateLimit: {
        max: 1, // Maximum 1 requests
        timeWindow: "1 minute", // Per minute
      },
    },
  },
  async (
    request: FastifyRequest<{ Params: { email: string; token: string } }>,
    reply: FastifyReply
  ) => {
    const { email, token } = request.params;

    try {
      // Check if email exists
      const { data: existingData, error: fetchError } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

      if (fetchError || !existingData) {
        return reply.status(404).send({ error: "Email not found" });
      }

      if (existingData.verified) {
        return reply.status(400).send({
          error: "Email is already verified, please proceed to use the app.",
        });
      }

      // Check if token matches
      if (existingData.token !== token) {
        return reply.status(400).send({ error: "Faulty token" });
      }

      // Check token expiration
      const decodedToken = (await verifyToken(token)) as JwtPayload;

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
      const { data: updatedData, error: updateError } = await supabase
        .from("users")
        .update({ verified: true })
        .eq("email", email)
        .select();

      if (updateError) {
        return reply
          .status(500)
          .send({ error: "Failed to update verification status" });
      }

      return reply.send({ status: "success", data: updatedData });
    } catch (error) {
      // Handle specific token errors
      if (error instanceof TokenExpiredError) {
        return reply.status(401).send({
          error:
            "The token is expired, please request another verification link.",
        });
      }
      // Handle other potential errors
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  }
);

// Define the route
app.post(
  "/upsert-testator",
  async (
    request: FastifyRequest<{
      Body: {
        full_name: string;
        father_name: string;
        date_of_birth: string; // We'll parse this to a date
        nationality: string;
        address: string;
        will_declaration: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    // Extract the Authorization header
    const authHeader = request.headers["authorization"];

    if (!authHeader) {
      return reply
        .status(401)
        .send({ error: "Authorization header is missing" });
    }

    // Check if the Authorization header has the Bearer token
    const token = authHeader.split(" ")[1];
    if (!token) {
      return reply.status(401).send({ error: "Bearer token is missing" });
    }

    // Decode and verify the token
    let decodedToken;
    try {
      decodedToken = await verifyToken(token); // Replace with your actual secret key
    } catch (err) {
      return reply.status(401).send({ error: "Invalid token" });
    }

    // Extract user ID from the token
    const userId = decodedToken.id;
    if (!userId) {
      return reply.status(401).send({ error: "Invalid token payload" });
    }

    // Extract and validate the request body
    const {
      full_name,
      father_name,
      date_of_birth,
      nationality,
      address,
      will_declaration,
    } = request.body;

    if (
      !full_name ||
      !father_name ||
      !date_of_birth ||
      !nationality ||
      !address ||
      !will_declaration
    ) {
      return reply
        .status(400)
        .send({ error: "Missing required fields in the request body" });
    }

    // Parse the date_of_birth to a date object
    const parsedDate = new Date(date_of_birth);
    if (isNaN(parsedDate.getTime())) {
      return reply.status(400).send({ error: "Invalid date_of_birth format" });
    }

    // Prepare the data to upsert
    const upsertData = {
      user_id: userId,
      full_name,
      father_name,
      date_of_birth: parsedDate.toISOString().split("T")[0], // Format as 'YYYY-MM-DD'
      nationality,
      address,
      will_declaration,
    };

    try {
      // Perform the upsert operation
      const { data, error } = await supabase
        .from("testators")
        .upsert(upsertData, { onConflict: "user_id" }) // Upsert based on user_id
        .select();

      if (error) {
        console.error("Supabase error:", error);
        return reply
          .status(500)
          .send({ error: "Database error", details: error.message });
      }

      // Return the inserted/updated data
      return reply.status(200).send({ status: "success", id: data[0].id });
    } catch (err) {
      console.error("Server error:", err);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  }
);

app.post(
  "/upsert-executor",
  async (
    request: FastifyRequest<{
      Body: {
        full_name: string;
        father_name: string;
        date_of_birth: string; // We'll parse this to a date
        nationality: string;
        address: string;
        consent: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    // Extract the Authorization header
    const authHeader = request.headers["authorization"];

    if (!authHeader) {
      return reply
        .status(401)
        .send({ error: "Authorization header is missing" });
    }

    // Check if the Authorization header has the Bearer token
    const tokenParts = authHeader.split(" ");
    if (tokenParts[0] !== "Bearer" || !tokenParts[1]) {
      return reply.status(401).send({ error: "Bearer token is missing" });
    }
    const token = tokenParts[1];

    // Decode and verify the token
    let decodedToken;
    try {
      decodedToken = await verifyToken(token); // Replace with your actual secret key
    } catch (err) {
      return reply.status(401).send({ error: "Invalid token" });
    }

    // Extract user ID from the token
    const userId = decodedToken.id;
    if (!userId) {
      return reply.status(401).send({ error: "Invalid token payload" });
    }

    // Extract and validate the request body
    const {
      full_name,
      father_name,
      date_of_birth,
      nationality,
      address,
      consent,
    } = request.body;

    if (
      !full_name ||
      !father_name ||
      !date_of_birth ||
      !nationality ||
      !address ||
      consent === undefined
    ) {
      return reply.status(400).send({
        error: "Missing required fields in the request body",
      });
    }

    // Validate the consent field
    if (typeof consent !== "string") {
      return reply.status(400).send({
        error: "Invalid consent value; it should be a boolean",
      });
    }

    // Parse the date_of_birth to a date object
    const parsedDate = new Date(date_of_birth);
    if (isNaN(parsedDate.getTime())) {
      return reply.status(400).send({ error: "Invalid date_of_birth format" });
    }

    // Prepare the data to upsert
    const upsertData = {
      user_id: userId,
      full_name,
      father_name,
      date_of_birth: parsedDate.toISOString().split("T")[0], // Format as 'YYYY-MM-DD'
      nationality,
      address,
      consent,
    };

    try {
      // Perform the upsert operation
      const { data, error } = await supabase
        .from("executors")
        .upsert(upsertData, { onConflict: "user_id" }) // Upsert based on user_id
        .select();

      if (error) {
        console.error("Supabase error:", error);
        return reply.status(500).send({
          error: "Database error",
          details: error.message,
        });
      }

      // Check if data was returned
      if (data && data.length > 0) {
        return reply.status(200).send({ status: "success", id: data[0].id });
      } else {
        return reply
          .status(500)
          .send({ error: "Failed to upsert executor data" });
      }
    } catch (err) {
      console.error("Server error:", err);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  }
);

// Define the route
app.post(
  "/upsert-beneficiary",
  async (
    request: FastifyRequest<{
      Body: {
        id?: string; // Optional, for updating existing beneficiaries
        full_name: string;
        father_name: string;
        date_of_birth: string; // We'll parse this to a date
        relationship_with_testator: string;
        address: string;
        share: string; // Assuming share is a number representing percentage
      };
    }>,
    reply: FastifyReply
  ) => {
    // Extract the Authorization header
    const authHeader = request.headers["authorization"];

    if (!authHeader) {
      return reply
        .status(401)
        .send({ error: "Authorization header is missing" });
    }

    // Check if the Authorization header has the Bearer token
    const tokenParts = authHeader.split(" ");
    if (tokenParts[0] !== "Bearer" || !tokenParts[1]) {
      return reply.status(401).send({ error: "Bearer token is missing" });
    }
    const token = tokenParts[1];

    // Decode and verify the token
    let decodedToken;
    try {
      decodedToken = await verifyToken(token); // Replace with your actual secret key
    } catch (err) {
      return reply.status(401).send({ error: "Invalid token" });
    }

    // Extract user ID from the token
    const userId = decodedToken.id;
    if (!userId) {
      return reply.status(401).send({ error: "Invalid token payload" });
    }

    // Extract and validate the request body
    const {
      id, // Optional, for upserting existing beneficiaries
      full_name,
      father_name,
      date_of_birth,
      relationship_with_testator,
      address,
      share,
    } = request.body;

    if (
      !full_name ||
      !father_name ||
      !date_of_birth ||
      !relationship_with_testator ||
      !address ||
      share === undefined
    ) {
      return reply.status(400).send({
        error: "Missing required fields in the request body",
      });
    }

    // Parse the date_of_birth to a date object
    const parsedDate = new Date(date_of_birth);
    if (isNaN(parsedDate.getTime())) {
      return reply.status(400).send({ error: "Invalid date_of_birth format" });
    }

    // Prepare the data to upsert
    const upsertData: any = {
      user_id: userId,
      full_name,
      father_name,
      date_of_birth: parsedDate.toISOString().split("T")[0], // Format as 'YYYY-MM-DD'
      relationship_with_testator,
      address,
      share,
    };

    // Include the id if it's provided
    if (id) {
      upsertData.id = id;
    }

    try {
      // Perform the upsert operation
      const { data, error } = await supabase
        .from("beneficiaries")
        .upsert(upsertData, { onConflict: "user_id" }) // Upsert based on id
        .select();

      if (error) {
        console.error("Supabase error:", error);
        return reply.status(500).send({
          error: "Database error",
          details: error.message,
        });
      }

      // Check if data was returned
      if (data && data.length > 0) {
        return reply.status(200).send({ status: "success", id: data[0].id });
      } else {
        return reply
          .status(500)
          .send({ error: "Failed to upsert beneficiary data" });
      }
    } catch (err) {
      console.error("Server error:", err);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  }
);

// Define the route
app.post(
  "/upsert-witness",
  async (
    request: FastifyRequest<{
      Body: {
        id?: string; // Optional, for updating existing witnesses
        full_name: string;
        father_name: string;
        address: string;
        contact: string;
        email: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    // Extract the Authorization header
    const authHeader = request.headers["authorization"];

    if (!authHeader) {
      return reply
        .status(401)
        .send({ error: "Authorization header is missing" });
    }

    // Check if the Authorization header has the Bearer token
    const tokenParts = authHeader.split(" ");
    if (tokenParts[0] !== "Bearer" || !tokenParts[1]) {
      return reply.status(401).send({ error: "Bearer token is missing" });
    }
    const token = tokenParts[1];

    // Decode and verify the token
    let decodedToken;
    try {
      decodedToken = await verifyToken(token); // Replace with your actual secret key
    } catch (err) {
      return reply.status(401).send({ error: "Invalid token" });
    }

    // Extract user ID from the token
    const userId = decodedToken.id;
    if (!userId) {
      return reply.status(401).send({ error: "Invalid token payload" });
    }

    // Extract and validate the request body
    const {
      id, // Optional, for upserting existing witnesses
      full_name,
      father_name,
      address,
      contact,
      email,
    } = request.body;

    if (!full_name || !father_name || !address || !contact || !email) {
      return reply.status(400).send({
        error: "Missing required fields in the request body",
      });
    }

    // Validate the email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.status(400).send({
        error: "Invalid email format",
      });
    }

    // Prepare the data to upsert
    const upsertData: any = {
      user_id: userId,
      full_name,
      father_name,
      address,
      contact,
      email,
    };

    // Include the id if it's provided
    if (id) {
      upsertData.id = id;
    }

    try {
      // Perform the upsert operation
      const { data, error } = await supabase
        .from("witnesses")
        .upsert(upsertData, { onConflict: "user_id" }) // Upsert based on id
        .select();

      if (error) {
        console.error("Supabase error:", error);
        return reply.status(500).send({
          error: "Database error",
          details: error.message,
        });
      }

      // Check if data was returned
      if (data && data.length > 0) {
        return reply.status(200).send({ status: "success", id: data[0].id });
      } else {
        return reply
          .status(500)
          .send({ error: "Failed to upsert witness data" });
      }
    } catch (err) {
      console.error("Server error:", err);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  }
);
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_TEST_KEY_ID!,
  key_secret: process.env.RAZORPAY_TEST_KEY_SECRET!,
});

// Define the route
app.post("/create-order", async (request, reply: FastifyReply) => {
  // Extract the Authorization header
  const authHeader = request.headers["authorization"];

  if (!authHeader) {
    return reply.status(401).send({ error: "Authorization header is missing" });
  }

  const tokenParts = authHeader.split(" ");
  if (tokenParts[0] !== "Bearer" || !tokenParts[1]) {
    return reply.status(401).send({ error: "Bearer token is missing" });
  }
  const token = tokenParts[1];

  // Decode and verify the token
  let decodedToken: any;
  try {
    decodedToken = await verifyToken(token);
  } catch (err) {
    return reply.status(401).send({ error: "Invalid token" });
  }

  // Extract user ID from the token
  const userId = decodedToken.id;
  if (!userId) {
    return reply.status(401).send({ error: "Invalid token payload" });
  }

  const amount = 532; // TODO: This is a backend hard coded amount
  const receipt = `receipt_${new Date().getTime()}`;

  try {
    // Create an order using Razorpay API
    const options = {
      amount: amount * 100, // Amount in paise
      currency: "INR",
      receipt: receipt,
      payment_capture: 1, // Auto-capture payment
    };

    const order = await razorpay.orders.create(options);

    // Insert the order details into the transactions table
    const { data, error } = await supabase
      .from("transactions")
      .insert([
        {
          user_id: userId,
          order_id: order.id,
          amount,
          currency: "INR",
          status: order.status,
          receipt: order.receipt,
        },
      ])
      .select();

    if (error) {
      console.error("Supabase error:", error);
      return reply
        .status(500)
        .send({ error: "Database error", details: error.message });
    }

    // Return the order details to the frontend
    return reply.status(200).send({ order });
  } catch (err) {
    console.error("Razorpay error:", err);
    return reply.status(500).send({ error: "Razorpay error", details: err });
  }
});

app.post(
  "/verify-payment",
  async (
    request: FastifyRequest<{
      Body: { order_id: string; payment_id: string; signature: string };
    }>,
    reply: FastifyReply
  ) => {
    // Extract the Authorization header (optional, if needed)
    const authHeader = request.headers["authorization"];

    // Optionally verify the user as before...

    // Extract and validate the request body
    const { order_id, payment_id, signature } = request.body;

    if (!order_id || !payment_id || !signature) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

    // Generate the expected signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_TEST_KEY_SECRET!)
      .update(order_id + "|" + payment_id)
      .digest("hex");

    // Compare the signatures
    if (generatedSignature !== signature) {
      return reply.status(400).send({ error: "Invalid payment signature" });
    }

    try {
      // Update the transaction status in the database
      const { data, error } = await supabase
        .from("transactions")
        .update({ payment_id, status: "paid" })
        .eq("order_id", order_id)
        .select();

      if (error) {
        console.error("Supabase error:", error);
        return reply
          .status(500)
          .send({ error: "Database error", details: error.message });
      }

      // Return success response
      return reply
        .status(200)
        .send({ status: "Payment verified successfully" });
    } catch (err) {
      console.error("Server error:", err);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  }
);

app.get("/user-data", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Extract the 'access-token' from the cookies
    const accessToken = request.cookies["access-token"];
    if (!accessToken) {
      return reply
        .status(401)
        .send({ error: "Unauthorized: No access token found." });
    }

    // Decode and verify the token
    let decodedToken: JwtPayload;
    try {
      decodedToken = (await verifyToken(accessToken)) as JwtPayload;
    } catch (err) {
      request.log.error("Token verification failed:", err);
      return reply.status(401).send({ error: "Invalid or expired token." });
    }

    // Extract user ID from the token
    const userId = decodedToken.id;
    if (!userId) {
      return reply.status(401).send({ error: "Invalid token payload." });
    }

    // Fetch data from Supabase
    const { data: testator, error: testatorError } = await supabase
      .from("testators")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (testatorError) {
      request.log.error("Supabase testator fetch error:", testatorError);
      return reply
        .status(500)
        .send({ error: "Database error", details: testatorError.message });
    }

    const { data: executors, error: executorsError } = await supabase
      .from("executors")
      .select("*")
      .eq("user_id", userId);

    if (executorsError) {
      request.log.error("Supabase executors fetch error:", executorsError);
      return reply
        .status(500)
        .send({ error: "Database error", details: executorsError.message });
    }

    const { data: beneficiaries, error: beneficiariesError } = await supabase
      .from("beneficiaries")
      .select("*")
      .eq("user_id", userId);

    if (beneficiariesError) {
      request.log.error(
        "Supabase beneficiaries fetch error:",
        beneficiariesError
      );
      return reply.status(500).send({
        error: "Database error",
        details: beneficiariesError.message,
      });
    }

    const { data: witnesses, error: witnessesError } = await supabase
      .from("witnesses")
      .select("*")
      .eq("user_id", userId);

    if (witnessesError) {
      request.log.error("Supabase witnesses fetch error:", witnessesError);
      return reply
        .status(500)
        .send({ error: "Database error", details: witnessesError.message });
    }

    // Construct the response object
    const responseData: UserDataResponse = {
      testator,
      executors,
      beneficiaries,
      witnesses,
    };

    return reply.status(200).send(responseData);
  } catch (err) {
    request.log.error("Server error:", err);
    return reply.status(500).send({ error: "Internal Server Error" });
  }
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
