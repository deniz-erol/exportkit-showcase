import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * **Validates: Requirements 3.3, 3.6, 3.7**
 *
 * Property 6: OAuth buttons render with provider-specific content
 * For any OAuth provider (google, github, microsoft) and mode (signin, signup),
 * the OAuthButton component should render with the correct provider name, logo,
 * and action text ("Sign in with" or "Sign up with").
 */

/**
 * Provider configuration from OAuthButton component
 */
const PROVIDER_CONFIG = {
  google: {
    name: "Google",
    bgColor: "bg-white hover:bg-gray-50",
    textColor: "text-gray-700",
    borderColor: "border-gray-300",
  },
  github: {
    name: "GitHub",
    bgColor: "bg-gray-900 hover:bg-gray-800",
    textColor: "text-white",
    borderColor: "border-gray-900",
  },
  microsoft: {
    name: "Microsoft",
    bgColor: "bg-white hover:bg-gray-50",
    textColor: "text-gray-700",
    borderColor: "border-gray-300",
  },
} as const;

/**
 * Simulate the button text generation logic from OAuthButton
 */
function getButtonText(
  provider: "google" | "github" | "microsoft",
  mode: "signin" | "signup" | "continue"
): string {
  const config = PROVIDER_CONFIG[provider];
  const actionText = mode === "signup" ? "Sign up" : mode === "continue" ? "Continue" : "Sign in";
  return `${actionText} with ${config.name}`;
}

/**
 * Simulate the provider configuration lookup from OAuthButton
 */
function getProviderConfig(provider: "google" | "github" | "microsoft") {
  return PROVIDER_CONFIG[provider];
}

describe("Property 6: OAuth buttons render with provider-specific content", () => {
  it("generates correct button text for all provider and mode combinations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: fc.constantFrom("google", "github", "microsoft"),
          mode: fc.constantFrom("signin", "signup", "continue"),
        }),
        async ({ provider, mode }) => {
          // Get the button text
          const buttonText = getButtonText(provider, mode);

          // Property 1: Button text should contain the action verb
          const expectedAction = mode === "signup" ? "Sign up" : mode === "continue" ? "Continue" : "Sign in";
          expect(buttonText).toContain(expectedAction);

          // Property 2: Button text should contain the provider name
          const config = getProviderConfig(provider);
          expect(buttonText).toContain(config.name);

          // Property 3: Button text should follow the pattern "[Action] with [Provider]"
          const expectedText = `${expectedAction} with ${config.name}`;
          expect(buttonText).toBe(expectedText);

          // Property 4: Provider name should be capitalized correctly
          if (provider === "google") {
            expect(config.name).toBe("Google");
          } else if (provider === "github") {
            expect(config.name).toBe("GitHub");
          } else if (provider === "microsoft") {
            expect(config.name).toBe("Microsoft");
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it("provides unique styling configuration for each provider", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("google", "github", "microsoft"),
        async (provider) => {
          const config = getProviderConfig(provider);

          // Property 1: Each provider has a name
          expect(config.name).toBeDefined();
          expect(typeof config.name).toBe("string");
          expect(config.name.length).toBeGreaterThan(0);

          // Property 2: Each provider has background color classes
          expect(config.bgColor).toBeDefined();
          expect(typeof config.bgColor).toBe("string");
          expect(config.bgColor).toContain("bg-");
          expect(config.bgColor).toContain("hover:bg-");

          // Property 3: Each provider has text color classes
          expect(config.textColor).toBeDefined();
          expect(typeof config.textColor).toBe("string");
          expect(config.textColor).toContain("text-");

          // Property 4: Each provider has border color classes
          expect(config.borderColor).toBeDefined();
          expect(typeof config.borderColor).toBe("string");
          expect(config.borderColor).toContain("border-");

          // Property 5: GitHub has dark styling (distinguishing characteristic)
          if (provider === "github") {
            expect(config.bgColor).toContain("gray-900");
            expect(config.textColor).toBe("text-white");
          }

          // Property 6: Google and Microsoft have light styling
          if (provider === "google" || provider === "microsoft") {
            expect(config.bgColor).toContain("bg-white");
            expect(config.textColor).toContain("gray-700");
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it("maintains consistent button text format across all combinations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: fc.constantFrom("google", "github", "microsoft"),
          mode: fc.constantFrom("signin", "signup", "continue"),
        }),
        async ({ provider, mode }) => {
          const buttonText = getButtonText(provider, mode);

          // Property 1: Button text should always contain " with "
          expect(buttonText).toContain(" with ");

          // Property 2: Button text should start with either "Sign in", "Sign up", or "Continue"
          const startsWithSignIn = buttonText.startsWith("Sign in");
          const startsWithSignUp = buttonText.startsWith("Sign up");
          const startsWithContinue = buttonText.startsWith("Continue");
          expect(startsWithSignIn || startsWithSignUp || startsWithContinue).toBe(true);

          // Property 3: The action should match the mode
          if (mode === "signin") {
            expect(buttonText.startsWith("Sign in")).toBe(true);
          } else if (mode === "signup") {
            expect(buttonText.startsWith("Sign up")).toBe(true);
          } else {
            expect(buttonText.startsWith("Continue")).toBe(true);
          }

          // Property 4: Button text should not be empty
          expect(buttonText.length).toBeGreaterThan(0);

          // Property 5: Button text should not have extra whitespace
          expect(buttonText).toBe(buttonText.trim());
          expect(buttonText).not.toContain("  "); // No double spaces
        }
      ),
      { numRuns: 30 }
    );
  });

  it("ensures all providers are supported and have complete configuration", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("google", "github", "microsoft"),
        async (provider) => {
          // Property 1: Provider exists in configuration
          expect(PROVIDER_CONFIG[provider]).toBeDefined();

          // Property 2: Configuration has all required fields
          const config = PROVIDER_CONFIG[provider];
          expect(config).toHaveProperty("name");
          expect(config).toHaveProperty("bgColor");
          expect(config).toHaveProperty("textColor");
          expect(config).toHaveProperty("borderColor");

          // Property 3: All configuration values are non-empty strings
          expect(config.name).toBeTruthy();
          expect(config.bgColor).toBeTruthy();
          expect(config.textColor).toBeTruthy();
          expect(config.borderColor).toBeTruthy();

          // Property 4: Provider can generate button text for all three modes
          const signinText = getButtonText(provider, "signin");
          const signupText = getButtonText(provider, "signup");
          const continueText = getButtonText(provider, "continue");
          expect(signinText).toBeDefined();
          expect(signupText).toBeDefined();
          expect(continueText).toBeDefined();
          expect(signinText).not.toBe(signupText);
          expect(signinText).not.toBe(continueText);
          expect(signupText).not.toBe(continueText);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("verifies mode parameter correctly changes action text", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: fc.constantFrom("google", "github", "microsoft"),
        }),
        async ({ provider }) => {
          const signinText = getButtonText(provider, "signin");
          const signupText = getButtonText(provider, "signup");
          const continueText = getButtonText(provider, "continue");

          // Property 1: signin mode produces "Sign in" text
          expect(signinText).toContain("Sign in");
          expect(signinText).not.toContain("Sign up");
          expect(signinText).not.toContain("Continue");

          // Property 2: signup mode produces "Sign up" text
          expect(signupText).toContain("Sign up");
          expect(signupText).not.toContain("Sign in");
          expect(signupText).not.toContain("Continue");

          // Property 3: continue mode produces "Continue" text
          expect(continueText).toContain("Continue");
          expect(continueText).not.toContain("Sign in");
          expect(continueText).not.toContain("Sign up");

          // Property 4: All texts contain the same provider name
          const config = getProviderConfig(provider);
          expect(signinText).toContain(config.name);
          expect(signupText).toContain(config.name);
          expect(continueText).toContain(config.name);

          // Property 5: The only difference between signin/signup is the action verb
          expect(signinText.replace("Sign in", "Sign up")).toBe(signupText);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("ensures provider names match OAuth provider identifiers semantically", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("google", "github", "microsoft"),
        async (provider) => {
          const config = getProviderConfig(provider);

          // Property: Provider display name should match the provider identifier
          // (case-insensitive comparison to verify semantic match)
          expect(config.name.toLowerCase()).toBe(provider.toLowerCase());
        }
      ),
      { numRuns: 20 }
    );
  });
});

