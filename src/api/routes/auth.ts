/**
 * Auth Routes
 * 
 * Public authentication endpoints for signup, email verification,
 * and post-signup Stripe checkout.
 * Part of Phase C: Self-Serve Onboarding (ONBOARD-01, ONBOARD-02).
 */

import { Router } from "express";
import { z } from "zod";
import {
  register,
  verifyEmail,
  resendVerification,
} from "../../services/signup-service.js";
import { createCheckoutSession } from "../../services/billing-service.js";
import type { PlanTier } from "@prisma/client";
import logger from "../../lib/logger.js";

const router = Router();

/**
 * POST /api/auth/signup
 * 
 * Creates a new customer account with email/password.
 * Sends verification email and creates Free plan subscription.
 * Stores selected plan tier for post-verification Stripe checkout.
 */
router.post("/signup", async (req, res) => {
    // Handler implementation omitted for portfolio showcase
  });

/**
 * GET /api/auth/verify-email?token=xxx
 * 
 * Handles email verification link clicks from the verification email.
 * Redirects to dashboard login (Free plan) or Stripe Checkout (paid plan).
 */
router.get("/verify-email", async (req, res) => {
    // Handler implementation omitted for portfolio showcase
  });

/**
 * POST /api/auth/verify-email
 * 
 * Verifies a customer's email address using the token (API-style).
 * Returns verification result with checkout URL if paid plan selected.
 */
router.post("/verify-email", async (req, res) => {
    // Handler implementation omitted for portfolio showcase
  });

/**
 * POST /api/auth/resend-verification
 * 
 * Resends the verification email to a customer.
 * Always returns success (don't reveal if email exists).
 */
router.post("/resend-verification", async (req, res) => {
    // Handler implementation omitted for portfolio showcase
  });

export default router;
